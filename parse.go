package main

import (
	"bytes"
	"fmt"
	"html/template"
	"io/fs"
	"os"
	"path/filepath"
	"strings"

	"github.com/yuin/goldmark"
	"github.com/yuin/goldmark/extension"
	"github.com/yuin/goldmark/renderer/html"
	"gopkg.in/yaml.v3"
)

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
	md := goldmark.New(
		goldmark.WithExtensions(extension.Linkify),
		goldmark.WithRendererOptions(html.WithUnsafe()),
	)
	if err := md.Convert(body, &buf); err != nil {
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
