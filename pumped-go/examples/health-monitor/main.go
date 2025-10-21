package main

import (
	"fmt"
	"net/http"
	"os"
	"os/signal"
	"syscall"

	pumped "github.com/pumped-fn/pumped-go"
)

func main() {
	g := DefineGraph()

	scope := pumped.NewScope()

	logger, err := pumped.Resolve(scope, g.Logger)
	if err != nil {
		fmt.Fprintf(os.Stderr, "failed to resolve logger: %v\n", err)
		os.Exit(1)
	}

	_, err = pumped.Resolve(scope, g.Scheduler)
	if err != nil {
		logger.Error("failed to resolve scheduler: %v", err)
		os.Exit(1)
	}

	serviceHandler, err := pumped.Resolve(scope, g.ServiceHandler)
	if err != nil {
		logger.Error("failed to resolve service handler: %v", err)
		os.Exit(1)
	}

	healthHandler, err := pumped.Resolve(scope, g.HealthHandler)
	if err != nil {
		logger.Error("failed to resolve health handler: %v", err)
		os.Exit(1)
	}

	incidentHandler, err := pumped.Resolve(scope, g.IncidentHandler)
	if err != nil {
		logger.Error("failed to resolve incident handler: %v", err)
		os.Exit(1)
	}

	mux := http.NewServeMux()

	mux.HandleFunc("POST /services", serviceHandler.Create)
	mux.HandleFunc("GET /services", serviceHandler.List)
	mux.HandleFunc("GET /services/{id}", serviceHandler.Get)
	mux.HandleFunc("PUT /services/{id}", serviceHandler.Update)
	mux.HandleFunc("DELETE /services/{id}", serviceHandler.Delete)

	mux.HandleFunc("GET /services/{id}/health", healthHandler.GetCurrent)
	mux.HandleFunc("GET /services/{id}/history", healthHandler.GetHistory)
	mux.HandleFunc("POST /services/{id}/check", healthHandler.TriggerCheck)

	mux.HandleFunc("GET /services/{id}/incidents", incidentHandler.ListByService)
	mux.HandleFunc("GET /incidents/active", incidentHandler.ListActive)

	server := &http.Server{
		Addr:    ":8080",
		Handler: mux,
	}

	go func() {
		logger.Info("Server starting on :8080")
		if err := server.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			logger.Error("server failed: %v", err)
			os.Exit(1)
		}
	}()

	sigCh := make(chan os.Signal, 1)
	signal.Notify(sigCh, os.Interrupt, syscall.SIGTERM)
	<-sigCh

	logger.Info("Shutting down gracefully...")
	scope.Dispose()
}
