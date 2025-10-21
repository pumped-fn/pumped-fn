package main

import (
	"context"
	"encoding/json"
	"net/http"
	"strconv"
	"time"

	"github.com/google/uuid"
)

type ServiceHandler struct {
	serviceRepo ServiceRepo
	healthRepo  HealthCheckRepo
}

func NewServiceHandler(serviceRepo ServiceRepo, healthRepo HealthCheckRepo) *ServiceHandler {
	return &ServiceHandler{serviceRepo: serviceRepo, healthRepo: healthRepo}
}

type CreateServiceRequest struct {
	Name          string `json:"name"`
	Type          string `json:"type"`
	Endpoint      string `json:"endpoint"`
	CheckInterval int    `json:"checkInterval"`
	Timeout       int    `json:"timeout"`
	Criticality   string `json:"criticality"`
}

type UpdateServiceRequest struct {
	Name          string `json:"name"`
	Type          string `json:"type"`
	Endpoint      string `json:"endpoint"`
	CheckInterval int    `json:"checkInterval"`
	Timeout       int    `json:"timeout"`
	Criticality   string `json:"criticality"`
}

type ServiceResponse struct {
	ID            string  `json:"id"`
	Name          string  `json:"name"`
	Type          string  `json:"type"`
	Endpoint      string  `json:"endpoint"`
	CheckInterval int     `json:"checkInterval"`
	Timeout       int     `json:"timeout"`
	Criticality   string  `json:"criticality"`
	CreatedAt     int64   `json:"createdAt"`
	UpdatedAt     int64   `json:"updatedAt"`
	CurrentStatus *string `json:"currentStatus,omitempty"`
}

func (h *ServiceHandler) Create(w http.ResponseWriter, r *http.Request) {
	var req CreateServiceRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	service := &Service{
		ID:            uuid.New().String(),
		Name:          req.Name,
		Type:          ServiceType(req.Type),
		Endpoint:      req.Endpoint,
		CheckInterval: req.CheckInterval,
		Timeout:       req.Timeout,
		Criticality:   Criticality(req.Criticality),
		CreatedAt:     time.Now(),
		UpdatedAt:     time.Now(),
	}

	if err := h.serviceRepo.Create(service); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(h.toResponse(service, nil))
}

func (h *ServiceHandler) List(w http.ResponseWriter, r *http.Request) {
	services, err := h.serviceRepo.List()
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	responses := make([]ServiceResponse, 0, len(services))
	for _, service := range services {
		latestCheck, _ := h.healthRepo.GetLatest(service.ID)
		var status *string
		if latestCheck != nil {
			s := string(latestCheck.Status)
			status = &s
		}
		responses = append(responses, h.toResponse(service, status))
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(responses)
}

func (h *ServiceHandler) Get(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")

	service, err := h.serviceRepo.Get(id)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	if service == nil {
		http.Error(w, "service not found", http.StatusNotFound)
		return
	}

	latestCheck, _ := h.healthRepo.GetLatest(service.ID)
	var status *string
	if latestCheck != nil {
		s := string(latestCheck.Status)
		status = &s
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(h.toResponse(service, status))
}

func (h *ServiceHandler) Update(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")

	var req UpdateServiceRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	service, err := h.serviceRepo.Get(id)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	if service == nil {
		http.Error(w, "service not found", http.StatusNotFound)
		return
	}

	service.Name = req.Name
	service.Type = ServiceType(req.Type)
	service.Endpoint = req.Endpoint
	service.CheckInterval = req.CheckInterval
	service.Timeout = req.Timeout
	service.Criticality = Criticality(req.Criticality)

	if err := h.serviceRepo.Update(service); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(h.toResponse(service, nil))
}

func (h *ServiceHandler) Delete(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	if err := h.serviceRepo.Delete(id); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (h *ServiceHandler) toResponse(service *Service, currentStatus *string) ServiceResponse {
	return ServiceResponse{
		ID:            service.ID,
		Name:          service.Name,
		Type:          string(service.Type),
		Endpoint:      service.Endpoint,
		CheckInterval: service.CheckInterval,
		Timeout:       service.Timeout,
		Criticality:   string(service.Criticality),
		CreatedAt:     service.CreatedAt.Unix(),
		UpdatedAt:     service.UpdatedAt.Unix(),
		CurrentStatus: currentStatus,
	}
}

type HealthHandler struct {
	serviceRepo   ServiceRepo
	healthRepo    HealthCheckRepo
	healthChecker *HealthChecker
}

func NewHealthHandler(serviceRepo ServiceRepo, healthRepo HealthCheckRepo, healthChecker *HealthChecker) *HealthHandler {
	return &HealthHandler{serviceRepo: serviceRepo, healthRepo: healthRepo, healthChecker: healthChecker}
}

type HealthCheckResponse struct {
	ID           string  `json:"id"`
	ServiceID    string  `json:"serviceId"`
	Status       string  `json:"status"`
	ResponseTime *int    `json:"responseTime"`
	Error        *string `json:"error"`
	Timestamp    int64   `json:"timestamp"`
}

func (h *HealthHandler) GetCurrent(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")

	check, err := h.healthRepo.GetLatest(id)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	if check == nil {
		http.Error(w, "no health checks found", http.StatusNotFound)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(HealthCheckResponse{
		ID:           check.ID,
		ServiceID:    check.ServiceID,
		Status:       string(check.Status),
		ResponseTime: check.ResponseTime,
		Error:        check.Error,
		Timestamp:    check.Timestamp.Unix(),
	})
}

func (h *HealthHandler) GetHistory(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")

	fromStr := r.URL.Query().Get("from")
	toStr := r.URL.Query().Get("to")

	from, err := strconv.ParseInt(fromStr, 10, 64)
	if err != nil {
		http.Error(w, "invalid from timestamp", http.StatusBadRequest)
		return
	}

	to, err := strconv.ParseInt(toStr, 10, 64)
	if err != nil {
		http.Error(w, "invalid to timestamp", http.StatusBadRequest)
		return
	}

	checks, err := h.healthRepo.GetHistory(id, time.Unix(from, 0), time.Unix(to, 0))
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	responses := make([]HealthCheckResponse, 0, len(checks))
	for _, check := range checks {
		responses = append(responses, HealthCheckResponse{
			ID:           check.ID,
			ServiceID:    check.ServiceID,
			Status:       string(check.Status),
			ResponseTime: check.ResponseTime,
			Error:        check.Error,
			Timestamp:    check.Timestamp.Unix(),
		})
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(responses)
}

func (h *HealthHandler) TriggerCheck(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")

	service, err := h.serviceRepo.Get(id)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	if service == nil {
		http.Error(w, "service not found", http.StatusNotFound)
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), 30*time.Second)
	defer cancel()

	check, err := h.healthChecker.Check(ctx, service)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	if err := h.healthRepo.Create(check); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(HealthCheckResponse{
		ID:           check.ID,
		ServiceID:    check.ServiceID,
		Status:       string(check.Status),
		ResponseTime: check.ResponseTime,
		Error:        check.Error,
		Timestamp:    check.Timestamp.Unix(),
	})
}

type IncidentHandler struct {
	incidentRepo IncidentRepo
}

func NewIncidentHandler(incidentRepo IncidentRepo) *IncidentHandler {
	return &IncidentHandler{incidentRepo: incidentRepo}
}

type IncidentResponse struct {
	ID                string `json:"id"`
	ServiceID         string `json:"serviceId"`
	StartedAt         int64  `json:"startedAt"`
	RecoveredAt       *int64 `json:"recoveredAt"`
	Duration          *int   `json:"duration"`
	ChecksFailedCount int    `json:"checksFailedCount"`
}

func (h *IncidentHandler) ListByService(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")

	incidents, err := h.incidentRepo.ListByService(id)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	responses := make([]IncidentResponse, 0, len(incidents))
	for _, inc := range incidents {
		var recoveredAt *int64
		if inc.RecoveredAt != nil {
			ts := inc.RecoveredAt.Unix()
			recoveredAt = &ts
		}
		responses = append(responses, IncidentResponse{
			ID:                inc.ID,
			ServiceID:         inc.ServiceID,
			StartedAt:         inc.StartedAt.Unix(),
			RecoveredAt:       recoveredAt,
			Duration:          inc.Duration,
			ChecksFailedCount: inc.ChecksFailedCount,
		})
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(responses)
}

func (h *IncidentHandler) ListActive(w http.ResponseWriter, r *http.Request) {
	incidents, err := h.incidentRepo.ListActive()
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	responses := make([]IncidentResponse, 0, len(incidents))
	for _, inc := range incidents {
		responses = append(responses, IncidentResponse{
			ID:                inc.ID,
			ServiceID:         inc.ServiceID,
			StartedAt:         inc.StartedAt.Unix(),
			RecoveredAt:       nil,
			Duration:          nil,
			ChecksFailedCount: inc.ChecksFailedCount,
		})
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(responses)
}
