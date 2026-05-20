package main

import (
	"fmt"
	"html/template"
	"image"
	"io"
	"io/fs"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"time"

	"github.com/disintegration/imaging"
	"github.com/rwcarlsen/goexif/exif"
)

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

const maxImageWidth = 1400

func copyAssets() error {
	return filepath.WalkDir("assets", func(path string, d fs.DirEntry, err error) error {
		if err != nil {
			return err
		}
		dest := filepath.Join("public", path)
		if d.IsDir() {
			return os.MkdirAll(dest, 0755)
		}
		if isResizableImage(path) {
			return copyResizedImage(path, dest)
		}
		return copyFile(path, dest)
	})
}

func isResizableImage(path string) bool {
	ext := strings.ToLower(filepath.Ext(path))
	return ext == ".jpg" || ext == ".jpeg" || ext == ".png"
}

func jpegOrientation(src string) int {
	f, err := os.Open(src)
	if err != nil {
		return 1
	}
	defer f.Close()
	x, err := exif.Decode(f)
	if err != nil {
		return 1
	}
	tag, err := x.Get(exif.Orientation)
	if err != nil {
		return 1
	}
	o, err := tag.Int(0)
	if err != nil {
		return 1
	}
	return o
}

func applyOrientation(img image.Image, o int) image.Image {
	switch o {
	case 2:
		return imaging.FlipH(img)
	case 3:
		return imaging.Rotate180(img)
	case 4:
		return imaging.FlipV(img)
	case 5:
		return imaging.Transpose(img)
	case 6:
		return imaging.Rotate270(img)
	case 7:
		return imaging.Transverse(img)
	case 8:
		return imaging.Rotate90(img)
	}
	return img
}

func copyResizedImage(src, dst string) error {
	img, err := imaging.Open(src)
	if err != nil {
		return copyFile(src, dst)
	}

	if o := jpegOrientation(src); o > 1 {
		img = applyOrientation(img, o)
	}

	if img.Bounds().Dx() > maxImageWidth {
		img = imaging.Resize(img, maxImageWidth, 0, imaging.Lanczos)
	}

	ext := strings.ToLower(filepath.Ext(src))
	if ext == ".png" {
		return imaging.Save(img, dst)
	}
	return imaging.Save(img, dst, imaging.JPEGQuality(82))
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

func sortByDate(pages []Page) {
	sort.Slice(pages, func(i, j int) bool {
		ti, _ := time.Parse("2006-01-02", pages[i].Date)
		tj, _ := time.Parse("2006-01-02", pages[j].Date)
		return ti.After(tj)
	})
}
