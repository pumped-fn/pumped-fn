package main

import "time"

type MockServiceRepository struct {
	services map[string]*Service
}

func NewMockServiceRepository() *MockServiceRepository {
	return &MockServiceRepository{
		services: make(map[string]*Service),
	}
}

func (m *MockServiceRepository) Create(service *Service) error {
	m.services[service.ID] = service
	return nil
}

func (m *MockServiceRepository) Get(id string) (*Service, error) {
	if service, ok := m.services[id]; ok {
		return service, nil
	}
	return nil, nil
}

func (m *MockServiceRepository) List() ([]*Service, error) {
	services := make([]*Service, 0, len(m.services))
	for _, s := range m.services {
		services = append(services, s)
	}
	return services, nil
}

func (m *MockServiceRepository) Update(service *Service) error {
	m.services[service.ID] = service
	return nil
}

func (m *MockServiceRepository) Delete(id string) error {
	delete(m.services, id)
	return nil
}

type MockHealthCheckRepository struct {
	checks []*HealthCheck
}

func NewMockHealthCheckRepository() *MockHealthCheckRepository {
	return &MockHealthCheckRepository{
		checks: make([]*HealthCheck, 0),
	}
}

func (m *MockHealthCheckRepository) Create(check *HealthCheck) error {
	m.checks = append(m.checks, check)
	return nil
}

func (m *MockHealthCheckRepository) GetLatest(serviceID string) (*HealthCheck, error) {
	for i := len(m.checks) - 1; i >= 0; i-- {
		if m.checks[i].ServiceID == serviceID {
			return m.checks[i], nil
		}
	}
	return nil, nil
}

func (m *MockHealthCheckRepository) GetHistory(serviceID string, from, to time.Time) ([]*HealthCheck, error) {
	var history []*HealthCheck
	for _, check := range m.checks {
		if check.ServiceID == serviceID &&
			(check.Timestamp.Equal(from) || check.Timestamp.After(from)) &&
			(check.Timestamp.Equal(to) || check.Timestamp.Before(to)) {
			history = append(history, check)
		}
	}
	return history, nil
}

type MockIncidentRepository struct {
	incidents map[string]*Incident
}

func NewMockIncidentRepository() *MockIncidentRepository {
	return &MockIncidentRepository{
		incidents: make(map[string]*Incident),
	}
}

func (m *MockIncidentRepository) Create(incident *Incident) error {
	m.incidents[incident.ID] = incident
	return nil
}

func (m *MockIncidentRepository) Update(incident *Incident) error {
	m.incidents[incident.ID] = incident
	return nil
}

func (m *MockIncidentRepository) GetActive(serviceID string) (*Incident, error) {
	for _, inc := range m.incidents {
		if inc.ServiceID == serviceID && inc.RecoveredAt == nil {
			return inc, nil
		}
	}
	return nil, nil
}

func (m *MockIncidentRepository) ListByService(serviceID string) ([]*Incident, error) {
	var incidents []*Incident
	for _, inc := range m.incidents {
		if inc.ServiceID == serviceID {
			incidents = append(incidents, inc)
		}
	}
	return incidents, nil
}

func (m *MockIncidentRepository) ListActive() ([]*Incident, error) {
	var incidents []*Incident
	for _, inc := range m.incidents {
		if inc.RecoveredAt == nil {
			incidents = append(incidents, inc)
		}
	}
	return incidents, nil
}
