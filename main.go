package main

import (
	"bytes"
	"flag"
	"fmt"
	"html/template"
	"io"
	"io/fs"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"sync"
	"time"

	"github.com/yuin/goldmark"
	"gopkg.in/yaml.v3"
)

type Book struct {
	Title    string `yaml:"title"`
	Author   string `yaml:"author"`
	ISBN     string `yaml:"isbn"`
	Cover    string `yaml:"cover"`
	Progress int    `yaml:"progress"`
	Status   string `yaml:"status"` // reading | read | want-to-read
	Note     string `yaml:"note"`
	Rating   int    `yaml:"rating"`
	DateRead string `yaml:"date_read"`
	Slug     string
	// computed fields
	NoteWordCount int
	NoteReadTime  int // minutes
}

type Page struct {
	Title     string   `yaml:"title"`
	Date      string   `yaml:"date"`
	Tags      []string `yaml:"tags"`
	Section   string
	Slug      string
	Body      template.HTML
	Posts     []Page
	Books     []Book
	Book      Book // single book for detail pages
	WordCount int
	ReadTime  int // minutes
}

// devMode is true when running --serve; gates the hot-reload SSE script injection.
var devMode bool

// navSections controls which sections appear in the nav.
// Comment out a line here to remove it from the nav (also comment out the
// matching entry in the renders slice in buildSite to skip building those pages).
var navSections = []string{
	"readings",
	"projects",
	"learnings",
	"travel",
}

// SSE reload broadcaster
var (
	reloadClients = map[chan struct{}]struct{}{}
	reloadMu      sync.Mutex
)

func broadcastReload() {
	reloadMu.Lock()
	defer reloadMu.Unlock()
	for ch := range reloadClients {
		select {
		case ch <- struct{}{}:
		default:
		}
	}
}

func handleReload(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("Connection", "keep-alive")
	w.Header().Set("X-Accel-Buffering", "no")

	ch := make(chan struct{}, 1)
	reloadMu.Lock()
	reloadClients[ch] = struct{}{}
	reloadMu.Unlock()
	defer func() {
		reloadMu.Lock()
		delete(reloadClients, ch)
		reloadMu.Unlock()
	}()

	fmt.Fprintf(w, ": connected\n\n")
	if f, ok := w.(http.Flusher); ok {
		f.Flush()
	}

	select {
	case <-ch:
		fmt.Fprintf(w, "data: reload\n\n")
		if f, ok := w.(http.Flusher); ok {
			f.Flush()
		}
	case <-r.Context().Done():
	}
}

func latestMod(dirs []string) time.Time {
	var latest time.Time
	for _, dir := range dirs {
		filepath.WalkDir(dir, func(_ string, d fs.DirEntry, err error) error { //nolint:errcheck
			if err != nil {
				return nil
			}
			info, err := d.Info()
			if err != nil {
				return nil
			}
			if info.ModTime().After(latest) {
				latest = info.ModTime()
			}
			return nil
		})
	}
	return latest
}

func watchAndRebuild() {
	watched := []string{"content", "templates", "assets"}
	last := latestMod(watched)

	ticker := time.NewTicker(400 * time.Millisecond)
	defer ticker.Stop()

	for range ticker.C {
		if mod := latestMod(watched); mod.After(last) {
			last = mod
			if err := buildSite(); err != nil {
				log.Printf("rebuild error: %v", err)
				continue
			}
			fmt.Println("Rebuilt.")
			broadcastReload()
		}
	}
}

func main() {
	build := flag.Bool("build", false, "build the site into public/")
	serve := flag.Bool("serve", false, "serve public/ on localhost:8080")
	flag.Parse()

	if *serve {
		devMode = true
		if err := buildSite(); err != nil {
			fatal(err)
		}
		go watchAndRebuild()

		mux := http.NewServeMux()
		mux.HandleFunc("/~reload", handleReload)
		mux.Handle("/", http.FileServer(http.Dir("public")))

		fmt.Println("Serving at http://localhost:8080 — press Ctrl+C to stop")
		fatal(http.ListenAndServe(":8080", mux))
	}

	if *build || (!*build && !*serve) {
		if err := buildSite(); err != nil {
			fatal(err)
		}
		fmt.Println("Site built in public/")
	}
}

func buildSite() error {
	if err := os.RemoveAll("public"); err != nil {
		return err
	}
	if err := copyAssets(); err != nil {
		return err
	}

	base, err := os.ReadFile("templates/layouts/base.html")
	if err != nil {
		return err
	}

	books, err := parseBooks("content/books")
	if err != nil {
		return err
	}
	learnings, err := parseDir("content/learnings")
	if err != nil {
		return err
	}
	projects, err := parseDir("content/projects")
	if err != nil {
		return err
	}
	travel, err := parseDir("content/travel")
	if err != nil {
		return err
	}

	sortByDate(learnings)
	sortByDate(projects)
	sortByDate(travel)
	sortBooks(books)

	for _, b := range books {
		if b.Status != "read" && b.Status != "reading" {
			continue
		}
		bp := Page{Title: b.Title, Section: "readings", Book: b}
		if err := renderPage(base, "templates/pages/book.html", "public/readings/"+b.Slug+"/index.html", bp); err != nil {
			return err
		}
	}

	for _, p := range learnings {
		pp := p
		pp.Section = "learnings"
		if err := renderPage(base, "templates/pages/post.html", "public/learnings/"+p.Slug+"/index.html", pp); err != nil {
			return err
		}
	}
	for _, p := range projects {
		pp := p
		pp.Section = "projects"
		if err := renderPage(base, "templates/pages/post.html", "public/projects/"+p.Slug+"/index.html", pp); err != nil {
			return err
		}
	}
	for _, p := range travel {
		pp := p
		pp.Section = "travel"
		if err := renderPage(base, "templates/pages/post.html", "public/travel/"+p.Slug+"/index.html", pp); err != nil {
			return err
		}
	}

	renders := []struct {
		tmpl string
		out  string
		data Page
	}{
		{"index.html", "public/index.html", Page{Section: "home", Books: filterStatus(books, "reading")}},
		{"readings.html", "public/readings/index.html", Page{Title: "Readings", Section: "readings", Books: books}},
		{"learnings.html", "public/learnings/index.html", Page{Title: "Learnings", Section: "learnings", Posts: learnings}},
		{"projects.html", "public/projects/index.html", Page{Title: "Projects", Section: "projects", Posts: projects}},
		{"travel.html", "public/travel/index.html", Page{Title: "Travel", Section: "travel", Posts: travel}},
	}
	for _, r := range renders {
		if err := renderPage(base, "templates/pages/"+r.tmpl, r.out, r.data); err != nil {
			return err
		}
	}

	return nil
}

var funcMap = template.FuncMap{
	"filterStatus": func(books []Book, status string) []Book {
		return filterStatus(books, status)
	},
	"ratingDots": func(r int) string {
		if r == 0 {
			return ""
		}
		return strings.Repeat("●", r) + strings.Repeat("○", 5-r)
	},
	"currentYear": func() int { return time.Now().Year() },
	"devMode":     func() bool { return devMode },
	"navSections": func() []string { return navSections },
	"fmtDate": func(s string) string {
		if s == "" {
			return ""
		}
		t, err := time.Parse("2006-01-02", s)
		if err != nil {
			return s
		}
		return t.Format("January 2006")
	},
	"splitParagraphs": func(s string) []string {
		if s == "" {
			return nil
		}
		var out []string
		for _, p := range strings.Split(s, "\n") {
			p = strings.TrimSpace(p)
			if p != "" {
				out = append(out, p)
			}
		}
		if len(out) == 0 {
			return []string{strings.TrimSpace(s)}
		}
		return out
	},
}

// renderPage parses base + page template fresh each call to avoid shared define conflicts.
func renderPage(base []byte, tmplPath, outPath string, data Page) error {
	if err := os.MkdirAll(filepath.Dir(outPath), 0755); err != nil {
		return err
	}
	tmpl, err := template.New("base").Funcs(funcMap).Parse(string(base))
	if err != nil {
		return err
	}
	pageContent, err := os.ReadFile(tmplPath)
	if err != nil {
		return err
	}
	name := filepath.Base(tmplPath)
	if _, err = tmpl.New(name).Parse(string(pageContent)); err != nil {
		return fmt.Errorf("template %s: %w", name, err)
	}
	f, err := os.Create(outPath)
	if err != nil {
		return err
	}
	defer f.Close()
	return tmpl.ExecuteTemplate(f, "base", data)
}

func parseDir(dir string) ([]Page, error) {
	var pages []Page
	err := filepath.WalkDir(dir, func(path string, d fs.DirEntry, err error) error {
		if err != nil || d.IsDir() || filepath.Ext(path) != ".md" {
			return err
		}
		p, err := parsePage(path)
		if err != nil {
			return fmt.Errorf("parsing %s: %w", path, err)
		}
		pages = append(pages, p)
		return nil
	})
	return pages, err
}

func parsePage(path string) (Page, error) {
	raw, err := os.ReadFile(path)
	if err != nil {
		return Page{}, err
	}
	raw = bytes.ReplaceAll(raw, []byte("\r\n"), []byte("\n"))
	var p Page
	body := raw
	if bytes.HasPrefix(raw, []byte("---\n")) {
		parts := bytes.SplitN(raw[4:], []byte("\n---"), 2)
		if len(parts) == 2 {
			if err := yaml.Unmarshal(parts[0], &p); err != nil {
				return Page{}, err
			}
			body = bytes.TrimPrefix(parts[1], []byte("\n"))
		}
	}
	var buf bytes.Buffer
	if err := goldmark.Convert(body, &buf); err != nil {
		return Page{}, err
	}
	p.Body = template.HTML(buf.String()) //nolint:gosec // trusted local content
	p.Slug = strings.TrimSuffix(filepath.Base(path), ".md")
	wc := len(strings.Fields(string(body)))
	p.WordCount = wc
	p.ReadTime = wc / 200
	if p.ReadTime == 0 {
		p.ReadTime = 1
	}
	return p, nil
}

func parseBooks(dir string) ([]Book, error) {
	var books []Book
	err := filepath.WalkDir(dir, func(path string, d fs.DirEntry, err error) error {
		if err != nil || d.IsDir() || filepath.Ext(path) != ".md" {
			return err
		}
		b, err := parseBook(path)
		if err != nil {
			return fmt.Errorf("parsing %s: %w", path, err)
		}
		books = append(books, b)
		return nil
	})
	return books, err
}

func parseBook(path string) (Book, error) {
	raw, err := os.ReadFile(path)
	if err != nil {
		return Book{}, err
	}
	raw = bytes.ReplaceAll(raw, []byte("\r\n"), []byte("\n"))
	var b Book
	if bytes.HasPrefix(raw, []byte("---\n")) {
		parts := bytes.SplitN(raw[4:], []byte("\n---"), 2)
		if len(parts) == 2 {
			if err := yaml.Unmarshal(parts[0], &b); err != nil {
				return Book{}, err
			}
		}
	}
	b.Slug = strings.TrimSuffix(filepath.Base(path), ".md")
	if b.ISBN != "" && b.Cover == "" {
		b.Cover = "https://covers.openlibrary.org/b/isbn/" + b.ISBN + "-M.jpg"
	}
	if b.Note != "" {
		wc := len(strings.Fields(b.Note))
		b.NoteWordCount = wc
		b.NoteReadTime = wc / 200
		if b.NoteReadTime == 0 {
			b.NoteReadTime = 1
		}
	}
	return b, nil
}

func filterStatus(books []Book, status string) []Book {
	var out []Book
	for _, b := range books {
		if b.Status == status {
			out = append(out, b)
		}
	}
	return out
}

func sortBooks(books []Book) {
	sort.SliceStable(books, func(i, j int) bool {
		di, dj := books[i].DateRead, books[j].DateRead
		if di == "" && dj == "" {
			return books[i].Title < books[j].Title
		}
		if di == "" {
			return false
		}
		if dj == "" {
			return true
		}
		return di > dj
	})
}

func copyAssets() error {
	return filepath.WalkDir("assets", func(path string, d fs.DirEntry, err error) error {
		if err != nil {
			return err
		}
		dest := filepath.Join("public", path)
		if d.IsDir() {
			return os.MkdirAll(dest, 0755)
		}
		return copyFile(path, dest)
	})
}

func copyFile(src, dst string) error {
	in, err := os.Open(src)
	if err != nil {
		return err
	}
	defer in.Close()
	out, err := os.Create(dst)
	if err != nil {
		return err
	}
	defer out.Close()
	_, err = io.Copy(out, in)
	return err
}

func sortByDate(pages []Page) {
	sort.Slice(pages, func(i, j int) bool {
		ti, _ := time.Parse("2006-01-02", pages[i].Date)
		tj, _ := time.Parse("2006-01-02", pages[j].Date)
		return ti.After(tj)
	})
}

func fatal(err error) {
	fmt.Fprintln(os.Stderr, err)
	os.Exit(1)
}
