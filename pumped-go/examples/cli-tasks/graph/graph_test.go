package graph

import (
	"testing"

	pumped "github.com/pumped-fn/pumped-go"
	"github.com/pumped-fn/pumped-go/examples/cli-tasks/storage"
)

type MockStorage struct {
	tasks map[int]*storage.Task
}

func (m *MockStorage) Add(task *storage.Task) error {
	m.tasks[task.ID] = task
	return nil
}

func (m *MockStorage) Get(id int) (*storage.Task, error) {
	if task, ok := m.tasks[id]; ok {
		return task, nil
	}
	return nil, nil
}

func (m *MockStorage) List() ([]*storage.Task, error) {
	tasks := make([]*storage.Task, 0, len(m.tasks))
	for _, t := range m.tasks {
		tasks = append(tasks, t)
	}
	return tasks, nil
}

func (m *MockStorage) Update(task *storage.Task) error {
	m.tasks[task.ID] = task
	return nil
}

func TestTaskServiceWithMockStorage(t *testing.T) {
	g := Define()

	mockStorage := &MockStorage{
		tasks: map[int]*storage.Task{
			1: {ID: 1, Title: "Buy groceries", Completed: false},
			2: {ID: 2, Title: "Write tests", Completed: true},
		},
	}

	testScope := pumped.NewScope(
		pumped.WithPreset(g.Storage, mockStorage),
	)

	taskService, err := pumped.Resolve(testScope, g.TaskService)
	if err != nil {
		t.Fatalf("failed to resolve TaskService: %v", err)
	}

	tasks, err := taskService.List("all")
	if err != nil {
		t.Fatalf("failed to list tasks: %v", err)
	}

	if len(tasks) != 2 {
		t.Errorf("expected 2 tasks, got %d", len(tasks))
	}

	if tasks[0].Title != "Buy groceries" && tasks[1].Title != "Buy groceries" {
		t.Errorf("expected to find task 'Buy groceries'")
	}

	pendingTasks, err := taskService.List("pending")
	if err != nil {
		t.Fatalf("failed to list pending tasks: %v", err)
	}

	if len(pendingTasks) != 1 {
		t.Errorf("expected 1 pending task, got %d", len(pendingTasks))
	}
}

func TestStatsServiceWithMockStorage(t *testing.T) {
	g := Define()

	mockStorage := &MockStorage{
		tasks: map[int]*storage.Task{
			1: {ID: 1, Title: "Task 1", Completed: false},
			2: {ID: 2, Title: "Task 2", Completed: true},
			3: {ID: 3, Title: "Task 3", Completed: true},
			4: {ID: 4, Title: "Task 4", Completed: false},
		},
	}

	testScope := pumped.NewScope(
		pumped.WithPreset(g.Storage, mockStorage),
	)

	statsService, err := pumped.Resolve(testScope, g.StatsService)
	if err != nil {
		t.Fatalf("failed to resolve StatsService: %v", err)
	}

	stats, err := statsService.GetStats()
	if err != nil {
		t.Fatalf("failed to get stats: %v", err)
	}

	if stats.Total != 4 {
		t.Errorf("expected 4 total tasks, got %d", stats.Total)
	}

	if stats.Completed != 2 {
		t.Errorf("expected 2 completed tasks, got %d", stats.Completed)
	}

	if stats.Pending != 2 {
		t.Errorf("expected 2 pending tasks, got %d", stats.Pending)
	}
}

func TestStorageExecutorWithConfigPreset(t *testing.T) {
	g := Define()

	testConfig := &Config{
		StorageType: "memory",
		FilePath:    "test.json",
	}

	testScope := pumped.NewScope(
		pumped.WithPreset(g.Config, testConfig),
	)

	storageInstance, err := pumped.Resolve(testScope, g.Storage)
	if err != nil {
		t.Fatalf("failed to resolve Storage: %v", err)
	}

	if storageInstance == nil {
		t.Error("expected storage to be resolved")
	}

	task := &storage.Task{Title: "Test", Completed: false}
	err = storageInstance.Add(task)
	if err != nil {
		t.Fatalf("failed to add task: %v", err)
	}

	tasks, err := storageInstance.List()
	if err != nil {
		t.Fatalf("failed to list tasks: %v", err)
	}

	if len(tasks) == 0 {
		t.Error("expected at least one task")
	}

	if tasks[0].Title != "Test" {
		t.Errorf("expected task title 'Test', got %s", tasks[0].Title)
	}
}

func TestConfigDrivenStorageSelection(t *testing.T) {
	g := Define()

	memoryConfig := &Config{
		StorageType: "memory",
		FilePath:    "",
	}

	memoryScope := pumped.NewScope(
		pumped.WithPreset(g.Config, memoryConfig),
	)

	memoryStorage, err := pumped.Resolve(memoryScope, g.Storage)
	if err != nil {
		t.Fatalf("failed to resolve memory storage: %v", err)
	}

	if memoryStorage == nil {
		t.Error("expected memory storage to be resolved")
	}
}
