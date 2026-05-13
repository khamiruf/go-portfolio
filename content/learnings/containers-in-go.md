---
title: "Containers in Go"
date: "2026-05-13"
tags: ["go", "container", "isolation", "fundamentals"]
---

Source: https://youtu.be/Utf-A4rODH8?si=8REZI_7htxnkB2q4

## Why?

I've been using Docker for years — pulling images, writing Compose files, being generally smug about reproducible environments. But if you asked me *what a container actually is*, I'd have given you the marketing answer: "an isolated workspace that bundles dependencies so it runs the same everywhere." Which is true, but so is saying a car is "a metal box that moves." 

Two things containers do well, and I finally wanted to understand *how*:

1. **Isolation** — processes inside can't stomp on each other's memory or kernel state
2. **Reproducibility** — no more *"works on my machine"* (the most haunting five words in software)

So I built one in Go. [Source here](https://github.com/khamiruf/container_go), caveat below.

> *This requires a Linux environment (or WSL2/VM) — the underlying syscalls (`clone`, `unshare`, `setns`) are Linux-kernel-specific. macOS and Windows users, you know the drill.*

## So, What Actually Is It?

Turns out Docker isn't magic. It's two Linux kernel features duct-taped together in a very elegant way.

### Namespaces — The Art of Selective Amnesia

Namespaces are how the kernel lies to a process about the world it lives in. Each namespace says: "for *you*, reality looks like this."

- **UTS Namespace** (`CLONE_NEWUTS`) — isolates the hostname. Your container can call itself `my-cool-app` without the host machine caring.
- **PID Namespace** (`CLONE_NEWPID`) — isolates process IDs. Inside, your process is PID 1, king of the world. It can't see any host processes — they simply don't exist from its perspective.
- **Mount Namespace** — isolates the filesystem. Combined with `chroot`, the container is locked into a specific directory (`rootfs`) that *looks* like `/` to everything running inside it. It genuinely believes that's the whole filesystem.

### Control Groups (Cgroups) — The Bouncer

Namespaces handle *visibility*. Cgroups handle *limits*. They're the bouncer at the door saying "you get this much CPU, this much memory, and not a byte more."

Without cgroups, a container could just... consume your entire machine. Namespaces alone are a blindfold, not a cage.

### Container Images — Just a Tarball with Ambitions

A container image is a root filesystem (directories, binaries, libraries) plus some config (env vars, entrypoint command). That's it. The intimidating thing you `docker pull` from a registry is a glorified `.tar.gz` with metadata.

When you `docker run`, the runtime unpacks that filesystem, wraps it in namespaces, slaps on cgroup limits, and calls it a container. 

Demystified.