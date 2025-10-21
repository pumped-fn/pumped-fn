package handlers

import (
	"encoding/json"
	"fmt"
	"net/http"
	"strconv"
	"strings"

	"github.com/pumped-fn/pumped-go/examples/http-api/graph"

	pumped "github.com/pumped-fn/pumped-go"
)

func Register(mux *http.ServeMux, scope *pumped.Scope, g *graph.Graph) {
	mux.HandleFunc("/", handleIndex())
	mux.HandleFunc("/users", handleUsers(scope, g))
	mux.HandleFunc("/users/", handleUserByID(scope, g))
	mux.HandleFunc("/posts", handlePosts(scope, g))
	mux.HandleFunc("/posts/", handlePostByID(scope, g))
	mux.HandleFunc("/stats", handleStats(scope, g))
}

func handleIndex() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]string{
			"message": "API Server",
			"version": "1.0",
		})
	}
}

func handleUsers(scope *pumped.Scope, g *graph.Graph) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		userSvc, err := pumped.Resolve(scope, g.UserService)
		if err != nil {
			respondError(w, err, 500)
			return
		}

		switch r.Method {
		case "GET":
			users, err := userSvc.List()
			if err != nil {
				respondError(w, err, 500)
				return
			}
			respondJSON(w, users)

		case "POST":
			var req struct {
				Name  string `json:"name"`
				Email string `json:"email"`
			}
			if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
				respondError(w, err, 400)
				return
			}
			user, err := userSvc.Create(req.Name, req.Email)
			if err != nil {
				respondError(w, err, 400)
				return
			}
			respondJSON(w, user)

		default:
			respondError(w, fmt.Errorf("method not allowed"), 405)
		}
	}
}

func handleUserByID(scope *pumped.Scope, g *graph.Graph) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		idStr := strings.TrimPrefix(r.URL.Path, "/users/")
		id, err := strconv.Atoi(idStr)
		if err != nil {
			respondError(w, fmt.Errorf("invalid user ID"), 400)
			return
		}

		userSvc, err := pumped.Resolve(scope, g.UserService)
		if err != nil {
			respondError(w, err, 500)
			return
		}

		user, err := userSvc.Get(id)
		if err != nil {
			respondError(w, err, 404)
			return
		}

		respondJSON(w, user)
	}
}

func handlePosts(scope *pumped.Scope, g *graph.Graph) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		postSvc, err := pumped.Resolve(scope, g.PostService)
		if err != nil {
			respondError(w, err, 500)
			return
		}

		switch r.Method {
		case "GET":
			posts, err := postSvc.List()
			if err != nil {
				respondError(w, err, 500)
				return
			}
			respondJSON(w, posts)

		case "POST":
			var req struct {
				UserID  int    `json:"user_id"`
				Title   string `json:"title"`
				Content string `json:"content"`
			}
			if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
				respondError(w, err, 400)
				return
			}
			post, err := postSvc.Create(req.UserID, req.Title, req.Content)
			if err != nil {
				respondError(w, err, 400)
				return
			}
			respondJSON(w, post)

		default:
			respondError(w, fmt.Errorf("method not allowed"), 405)
		}
	}
}

func handlePostByID(scope *pumped.Scope, g *graph.Graph) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		idStr := strings.TrimPrefix(r.URL.Path, "/posts/")
		id, err := strconv.Atoi(idStr)
		if err != nil {
			respondError(w, fmt.Errorf("invalid post ID"), 400)
			return
		}

		postSvc, err := pumped.Resolve(scope, g.PostService)
		if err != nil {
			respondError(w, err, 500)
			return
		}

		post, err := postSvc.Get(id)
		if err != nil {
			respondError(w, err, 404)
			return
		}

		respondJSON(w, post)
	}
}

func handleStats(scope *pumped.Scope, g *graph.Graph) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		statsSvc, err := pumped.Resolve(scope, g.StatsService)
		if err != nil {
			respondError(w, err, 500)
			return
		}

		stats, err := statsSvc.GetStats()
		if err != nil {
			respondError(w, err, 500)
			return
		}

		respondJSON(w, stats)
	}
}

func respondJSON(w http.ResponseWriter, data interface{}) {
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(data)
}

func respondError(w http.ResponseWriter, err error, status int) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(map[string]string{
		"error": err.Error(),
	})
}
