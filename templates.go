package main

import (
	"bytes"
	"html/template"
	"sort"
	"strings"
	"time"

	"github.com/yuin/goldmark"
	"github.com/yuin/goldmark/extension"
	goldmarkhtml "github.com/yuin/goldmark/renderer/html"
)

var funcMap = template.FuncMap{
	"filterStatus": func(books []Book, status string) []Book {
		return filterStatus(books, status)
	},
	"joinTags": func(tags []string) string {
		return strings.Join(tags, ",")
	},
	"allTags": func(books []Book) []string {
		seen := map[string]bool{}
		var out []string
		for _, b := range books {
			for _, t := range b.Tags {
				if !seen[t] {
					seen[t] = true
					out = append(out, t)
				}
			}
		}
		sort.Strings(out)
		return out
	},
	"tagCounts": func(books []Book) map[string]int {
		counts := map[string]int{}
		for _, b := range books {
			for _, t := range b.Tags {
				counts[t]++
			}
		}
		return counts
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
	"markdownify": func(s string) template.HTML {
		var buf bytes.Buffer
		md := goldmark.New(
			goldmark.WithExtensions(extension.Linkify),
			goldmark.WithRendererOptions(goldmarkhtml.WithUnsafe()),
		)
		if err := md.Convert([]byte(s), &buf); err != nil {
			return template.HTML(template.HTMLEscapeString(s))
		}
		return template.HTML(buf.String())
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
