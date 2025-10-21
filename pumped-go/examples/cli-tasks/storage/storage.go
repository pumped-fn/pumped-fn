package storage

import (
	"encoding/json"
	"os"
	"sync"
)

type Task struct {
	ID        int    `json:"id"`
	Title     string `json:"title"`
	Completed bool   `json:"completed"`
}

type Storage interface {
	Add(task *Task) error
	List() ([]*Task, error)
	Update(task *Task) error
	Get(id int) (*Task, error)
}

type MemoryStorage struct {
	mu    sync.RWMutex
	tasks []*Task
	nextID int
}

func NewMemoryStorage() *MemoryStorage {
	return &MemoryStorage{
		tasks: []*Task{},
		nextID: 1,
	}
}

func (s *MemoryStorage) Add(task *Task) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	task.ID = s.nextID
	s.nextID++
	s.tasks = append(s.tasks, task)
	return nil
}

func (s *MemoryStorage) List() ([]*Task, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	result := make([]*Task, len(s.tasks))
	copy(result, s.tasks)
	return result, nil
}

func (s *MemoryStorage) Update(task *Task) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	for i, t := range s.tasks {
		if t.ID == task.ID {
			s.tasks[i] = task
			return nil
		}
	}
	return nil
}

func (s *MemoryStorage) Get(id int) (*Task, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	for _, t := range s.tasks {
		if t.ID == id {
			return t, nil
		}
	}
	return nil, nil
}

type FileStorage struct {
	filePath string
	mu       sync.RWMutex
}

func NewFileStorage(filePath string) (*FileStorage, error) {
	return &FileStorage{filePath: filePath}, nil
}

func (s *FileStorage) load() ([]*Task, error) {
	data, err := os.ReadFile(s.filePath)
	if err != nil {
		if os.IsNotExist(err) {
			return []*Task{}, nil
		}
		return nil, err
	}

	var tasks []*Task
	if err := json.Unmarshal(data, &tasks); err != nil {
		return nil, err
	}
	return tasks, nil
}

func (s *FileStorage) save(tasks []*Task) error {
	data, err := json.MarshalIndent(tasks, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(s.filePath, data, 0644)
}

func (s *FileStorage) Add(task *Task) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	tasks, err := s.load()
	if err != nil {
		return err
	}

	nextID := 1
	for _, t := range tasks {
		if t.ID >= nextID {
			nextID = t.ID + 1
		}
	}

	task.ID = nextID
	tasks = append(tasks, task)
	return s.save(tasks)
}

func (s *FileStorage) List() ([]*Task, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.load()
}

func (s *FileStorage) Update(task *Task) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	tasks, err := s.load()
	if err != nil {
		return err
	}

	for i, t := range tasks {
		if t.ID == task.ID {
			tasks[i] = task
			return s.save(tasks)
		}
	}
	return nil
}

func (s *FileStorage) Get(id int) (*Task, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	tasks, err := s.load()
	if err != nil {
		return nil, err
	}

	for _, t := range tasks {
		if t.ID == id {
			return t, nil
		}
	}
	return nil, nil
}
