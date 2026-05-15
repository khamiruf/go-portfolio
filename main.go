package main

import (
	"flag"
	"fmt"
	"net/http"
	"os"
	"sync"
)

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

var (
	reloadClients = map[chan struct{}]struct{}{}
	reloadMu      sync.Mutex
)

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

func fatal(err error) {
	fmt.Fprintln(os.Stderr, err)
	os.Exit(1)
}
