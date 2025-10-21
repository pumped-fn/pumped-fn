package main

import "time"

type ServiceRepo interface {
	Create(service *Service) error
	Get(id string) (*Service, error)
	List() ([]*Service, error)
	Update(service *Service) error
	Delete(id string) error
}

type HealthCheckRepo interface {
	Create(check *HealthCheck) error
	GetLatest(serviceID string) (*HealthCheck, error)
	GetHistory(serviceID string, from, to time.Time) ([]*HealthCheck, error)
}

type IncidentRepo interface {
	Create(incident *Incident) error
	Update(incident *Incident) error
	GetActive(serviceID string) (*Incident, error)
	ListByService(serviceID string) ([]*Incident, error)
	ListActive() ([]*Incident, error)
}
