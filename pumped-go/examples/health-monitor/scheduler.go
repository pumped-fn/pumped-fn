package main

import (
	"context"
	"sync"
	"time"
)

type Scheduler struct {
	serviceRepo      ServiceRepo
	healthRepo       HealthCheckRepo
	healthChecker    *HealthChecker
	incidentDetector *IncidentDetector
	logger           *Logger
	stopCh           chan struct{}
	wg               sync.WaitGroup
	mu               sync.Mutex
	running          bool
}

func NewScheduler(serviceRepo ServiceRepo, healthRepo HealthCheckRepo, healthChecker *HealthChecker, incidentDetector *IncidentDetector, logger *Logger) *Scheduler {
	return &Scheduler{
		serviceRepo:      serviceRepo,
		healthRepo:       healthRepo,
		healthChecker:    healthChecker,
		incidentDetector: incidentDetector,
		logger:           logger,
		stopCh:           make(chan struct{}),
	}
}

func (s *Scheduler) Start() {
	s.mu.Lock()
	defer s.mu.Unlock()

	if s.running {
		return
	}

	s.running = true
	s.wg.Add(1)
	go s.run()
}

func (s *Scheduler) Stop() {
	s.mu.Lock()
	defer s.mu.Unlock()

	if !s.running {
		return
	}

	close(s.stopCh)
	s.running = false
	s.wg.Wait()
}

func (s *Scheduler) run() {
	defer s.wg.Done()

	ticker := time.NewTicker(1 * time.Second)
	defer ticker.Stop()

	lastCheck := make(map[string]time.Time)

	for {
		select {
		case <-s.stopCh:
			return
		case now := <-ticker.C:
			s.checkServices(now, lastCheck)
		}
	}
}

func (s *Scheduler) checkServices(now time.Time, lastCheck map[string]time.Time) {
	services, err := s.serviceRepo.List()
	if err != nil {
		s.logger.Error("failed to list services: %v", err)
		return
	}

	for _, service := range services {
		last, exists := lastCheck[service.ID]
		interval := time.Duration(service.CheckInterval) * time.Second

		if !exists || now.Sub(last) >= interval {
			s.wg.Add(1)
			go s.performCheck(service)
			lastCheck[service.ID] = now
		}
	}
}

func (s *Scheduler) performCheck(service *Service) {
	defer s.wg.Done()

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	start := time.Now()
	check, err := s.healthChecker.Check(ctx, service)
	if err != nil {
		s.logger.Error("health check failed for service %s: %v", service.ID, err)
		return
	}

	if err := s.healthRepo.Create(check); err != nil {
		s.logger.Error("failed to save health check: %v", err)
		return
	}

	if err := s.incidentDetector.ProcessHealthCheck(check); err != nil {
		s.logger.Error("failed to process health check for incidents: %v", err)
	}

	elapsed := time.Since(start)
	s.logger.Info("health check completed for %s (%s) - status: %s, duration: %v", service.Name, service.ID, check.Status, elapsed)
}
