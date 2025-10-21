package main

import (
	"fmt"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"

	pumped "github.com/pumped-fn/pumped-go"
)

func main() {
	g := DefineGraph()

	scope := pumped.NewScope()

	scheduler, err := pumped.Resolve(scope, g.Scheduler)
	if err != nil {
		log.Fatalf("failed to resolve scheduler: %v", err)
	}

	serviceHandler, err := pumped.Resolve(scope, g.ServiceHandler)
	if err != nil {
		log.Fatalf("failed to resolve service handler: %v", err)
	}

	healthHandler, err := pumped.Resolve(scope, g.HealthHandler)
	if err != nil {
		log.Fatalf("failed to resolve health handler: %v", err)
	}

	incidentHandler, err := pumped.Resolve(scope, g.IncidentHandler)
	if err != nil {
		log.Fatalf("failed to resolve incident handler: %v", err)
	}

	scheduler.Start()
	defer scheduler.Stop()

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
		log.Println("Server starting on :8080")
		if err := server.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatalf("server failed: %v", err)
		}
	}()

	sigCh := make(chan os.Signal, 1)
	signal.Notify(sigCh, os.Interrupt, syscall.SIGTERM)
	<-sigCh

	fmt.Println("\nShutting down gracefully...")
	scope.Dispose()
}
