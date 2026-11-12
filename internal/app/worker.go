package app

import (
	"context"
	"errors"
	"flag"
	"io"
	"os"
	"os/signal"
	"syscall"
	"time"

	amqp "github.com/rabbitmq/amqp091-go"
	log "github.com/sirupsen/logrus"
)

type deliveryOutcome int

const (
	deliverySubmitted deliveryOutcome = iota
	deliveryPreviewed
	deliveryBypassed
	deliveryCallbackMissing
)

func Run() int {
	configureLogging(envOr("LOG_LEVEL", "info"), envOr("LOG_OUTPUT", "text"))
	if err := run(); err != nil {
		log.WithError(err).WithFields(log.Fields{
			"component": "workflow_stage",
			"event":     "stage_stopped",
		}).Error("Workflow stage stopped")
		return 1
	}
	return 0
}

func run() error {
	input := flag.String("input", "", "process a local workflow invocation JSON file without RabbitMQ or HTTP")
	once := flag.Bool("once", false, "exit after one delivery (preview always exits after one)")
	dashboardOnly := flag.Bool("dashboard", false, "only serve the results dashboard from RESULTS_DIR at DASHBOARD_ADDR")
	flag.Parse()
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()
	if *dashboardOnly {
		results, address, err := loadDashboardConfig()
		if err != nil {
			return err
		}
		if address == "" {
			address = defaultDashboardAddr
		}
		return serveDashboard(ctx, address, results)
	}
	settings, err := loadConfig(*input != "")
	if err != nil {
		return err
	}
	if *input != "" {
		body, err := os.ReadFile(*input)
		if err != nil {
			return err
		}
		invocation, err := handleInvocation(ctx, body, settings.operation, settings.start, settings.duration, settings.detector)
		if err != nil {
			return err
		}
		recordResult(settings, invocation, "offline")
		return printPreview(os.Stdout, invocation)
	}
	if settings.dashboardAddr != "" {
		go func() {
			if err := serveDashboard(ctx, settings.dashboardAddr, settings.results); err != nil {
				log.WithError(err).WithField("component", "dashboard").Error("Dashboard stopped")
			}
		}()
	}
	return consume(ctx, settings, *once)
}

// recordResult stores the outcome for the local dashboard. It is best-effort:
// Hub has the authoritative result, so a local write failure is only logged.
func recordResult(settings config, invocation handledInvocation, delivery string) {
	if settings.results == nil {
		return
	}
	record := newResultRecord(invocation, delivery, time.Now())
	if err := settings.results.save(record, invocation.detection.PeakSnapshot); err != nil {
		log.WithError(err).WithFields(log.Fields{
			"component": "workflow_stage",
			"event":     "result_record_failed",
			"run_id":    invocation.runID,
		}).Warn("Could not record result for the dashboard")
	}
}

var deliveryNames = map[deliveryOutcome]string{
	deliverySubmitted:       "submitted",
	deliveryPreviewed:       "preview",
	deliveryBypassed:        "bypass",
	deliveryCallbackMissing: "callback-missing",
}

func handleDelivery(ctx context.Context, settings config, delivery amqp.Delivery, output io.Writer) (deliveryOutcome, error) {
	invocation, err := handleInvocation(ctx, delivery.Body, settings.operation, settings.start, settings.duration, settings.detector)
	outcome := deliverySubmitted
	if err == nil {
		switch {
		case settings.mode == "http" && (invocation.callback == nil || invocation.callback.URL == ""):
			outcome = deliveryCallbackMissing
			err = printPreview(output, invocation)
		case settings.mode == "http":
			err = postResult(ctx, settings, invocation)
		case settings.mode == "preview":
			outcome = deliveryPreviewed
			err = printPreview(output, invocation)
		default:
			outcome = deliveryBypassed
			err = printPreview(output, invocation)
		}
		if err == nil {
			recordResult(settings, invocation, deliveryNames[outcome])
		}
	}
	if err != nil || settings.mode == "preview" {
		if nackErr := delivery.Nack(false, true); nackErr != nil {
			return outcome, errors.New("could not requeue delivery; closing connection")
		}
		return outcome, err
	}
	return outcome, delivery.Ack(false)
}

func consume(ctx context.Context, settings config, once bool) error {
	connection, err := amqp.DialConfig(settings.brokerURL, amqp.Config{Dial: amqp.DefaultDial(10 * time.Second)})
	if err != nil {
		return errors.New("RabbitMQ connection failed; check host, TLS, vhost and credentials")
	}
	defer connection.Close()
	channel, err := connection.Channel()
	if err != nil {
		return errors.New("cannot open RabbitMQ channel")
	}
	defer channel.Close()
	if err := channel.Qos(1, 0, false); err != nil {
		return errors.New("cannot set RabbitMQ prefetch")
	}
	deliveries, err := channel.Consume(settings.queue, "", false, false, false, false, nil)
	if err != nil {
		return errors.New("cannot consume STAGE_QUEUE; confirm it exists in this vhost and the account has read permission")
	}
	log.WithFields(log.Fields{
		"component": "workflow_stage",
		"event":     "workflow_invocation_waiting",
		"mode":      settings.mode,
	}).Info("Waiting for a workflow invocation; Ctrl+C to stop")
	for {
		select {
		case <-ctx.Done():
			return nil
		case delivery, open := <-deliveries:
			if !open {
				return errors.New("RabbitMQ delivery stream closed; restart the worker to reconnect")
			}
			logInvocation(log.StandardLogger(), delivery)
			outcome, err := handleDelivery(ctx, settings, delivery, os.Stdout)
			if err != nil {
				return err
			}
			switch outcome {
			case deliveryPreviewed:
				log.WithFields(log.Fields{
					"component": "workflow_stage",
					"event":     "workflow_invocation_previewed",
				}).Info("Preview only: message requeued, no result submitted to Hub")
				return nil
			case deliveryBypassed:
				log.WithFields(log.Fields{
					"component": "workflow_stage",
					"event":     "workflow_invocation_bypassed",
				}).Info("Bypass: message processed and acknowledged, no result submitted to Hub")
			case deliveryCallbackMissing:
				log.WithFields(log.Fields{
					"component": "workflow_stage",
					"event":     "workflow_callback_missing",
				}).Warn("Callback URL missing: result previewed and delivery acknowledged")
			case deliverySubmitted:
				log.WithFields(log.Fields{
					"component": "workflow_stage",
					"event":     "workflow_result_accepted",
				}).Info("Result accepted by callback; delivery acknowledged")
			}
			if once {
				return nil
			}
		}
	}
}
