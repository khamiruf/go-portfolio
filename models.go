package main

import "html/template"

type Book struct {
	Title    string   `yaml:"title"`
	Author   string   `yaml:"author"`
	ISBN     string   `yaml:"isbn"`
	Cover    string   `yaml:"cover"`
	Progress int      `yaml:"progress"`
	Status   string   `yaml:"status"` // reading | read | want-to-read
	Note     string   `yaml:"note"`
	Rating   int      `yaml:"rating"`
	DateRead string   `yaml:"date_read"`
	Tags     []string `yaml:"tags"`
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
