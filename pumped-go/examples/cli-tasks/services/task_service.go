package services

import (
	"fmt"

	"github.com/pumped-fn/pumped-go/examples/cli-tasks/storage"
)

type TaskService struct {
	storage storage.Storage
}

func NewTaskService(storage storage.Storage) *TaskService {
	return &TaskService{storage: storage}
}

func (s *TaskService) Add(title string) (*storage.Task, error) {
	if title == "" {
		return nil, fmt.Errorf("task title cannot be empty")
	}

	task := &storage.Task{
		Title:     title,
		Completed: false,
	}

	if err := s.storage.Add(task); err != nil {
		return nil, err
	}

	return task, nil
}

func (s *TaskService) List(filter string) ([]*storage.Task, error) {
	tasks, err := s.storage.List()
	if err != nil {
		return nil, err
	}

	if filter == "all" || filter == "" {
		return tasks, nil
	}

	var filtered []*storage.Task
	for _, task := range tasks {
		if filter == "pending" && !task.Completed {
			filtered = append(filtered, task)
		} else if filter == "completed" && task.Completed {
			filtered = append(filtered, task)
		}
	}

	return filtered, nil
}

func (s *TaskService) Complete(id int) (*storage.Task, error) {
	task, err := s.storage.Get(id)
	if err != nil {
		return nil, err
	}
	if task == nil {
		return nil, fmt.Errorf("task not found: %d", id)
	}

	task.Completed = true
	if err := s.storage.Update(task); err != nil {
		return nil, err
	}

	return task, nil
}
