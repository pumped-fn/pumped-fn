package services

import (
	"github.com/pumped-fn/pumped-go/examples/cli-tasks/storage"
)

type Stats struct {
	Total     int
	Pending   int
	Completed int
}

type StatsService struct {
	storage storage.Storage
}

func NewStatsService(storage storage.Storage) *StatsService {
	return &StatsService{storage: storage}
}

func (s *StatsService) GetStats() (*Stats, error) {
	tasks, err := s.storage.List()
	if err != nil {
		return nil, err
	}

	stats := &Stats{
		Total: len(tasks),
	}

	for _, task := range tasks {
		if task.Completed {
			stats.Completed++
		} else {
			stats.Pending++
		}
	}

	return stats, nil
}
