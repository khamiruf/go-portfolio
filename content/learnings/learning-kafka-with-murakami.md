---
title: "Learning Kafka with Murakami"
date: "2026-06-08"
tags: ["kafka", "go", "event-driven", "murakami", "aws-sqs", "messaging", "sse"]
---

Check it out here: https://github.com/khamiruf/kafka-on-the-shore

## Why?

I was halfway through *Kafka on the Shore* when I realised Murakami had been describing pub/sub architecture the entire time. Two narratives running in parallel, never directly touching, yet somehow converging through echoes neither character can explain. That's just event-driven design with better prose.

I've been working with AWS SQS at work for a while. Messages go in, messages come out. It works. But I kept wondering what it would feel like to work with a system where messages *don't* disappear after you read them. Where the log keeps everything. Where three different consumers can read the same stream and come away with completely different conclusions about what happened.

So I built a live event-stream dashboard. Murakami's parallel narratives became Kafka topics. The characters who bridge those worlds became consumers.

## Two worlds, two topics

In the novel, chapters alternate between Kafka Tamura (a runaway teenager) and Nakata (an old man who talks to cats). Their stories never directly intersect, but they ripple into each other through metaphysical echoes.

In the project, this became two topics:

- `tamura-journey` carries events from Kafka Tamura's narrative. Departures, arrivals, encounters, decisions.
- `nakata-world` carries events from Nakata's reality. Cat conversations, violence, mundane errands that somehow bend the fabric of things.

Two independent producers (`cmd/kafka-tamura` and `cmd/nakata`) write to their respective topics. They don't know about each other. They don't coordinate. Same as the book.

This maps to how I already think about SQS at work: separate services publishing events about their own domain, unaware of who's listening. The difference is what happens next. In SQS, once a message is consumed, it's gone. In Kafka, both streams persist. You can rewind Nakata's conversation with the cat to the very beginning. Queues forget; logs don't.

## The shore: one consumer group, three roles

The novel's real power comes from the *reader* holding both narratives at once, finding connections the characters themselves can't see. That's what I wanted the consumer group to do.

The consumer group is called `the-shore` (the place in the novel where both worlds meet). It has three consumers, each reading through a different lens:

`fate` detects echoes between the two topics. When an event in `tamura-journey` mirrors something in `nakata-world`, it catches the correlation. Cross-stream pattern matching.

`memory` chronicles everything. Both topics, all events, ordered. It's the omniscient narrator, or if you prefer, an audit log.

`the-stone` alerts on anomalies. In the novel, the entrance stone opens when reality fractures. This consumer watches for events that break expected patterns.

In SQS, you'd need three separate queues with an SNS topic fanning out to each, and each consumer polling independently. There's no "group" concept because there's no shared offset to coordinate around. In Kafka, these three consumers share partition assignments within the group. When one goes down, the others rebalance and pick up its partitions. The group adapts.

## Fan-out: the Boy Named Crow

The Boy Named Crow whispers to Kafka Tamura from somewhere outside the narrative. A voice that exists in parallel, consuming the same events but drawing a different interpretation.

That's fan-out. A second consumer group can subscribe to `tamura-journey` independently of `the-shore`, with its own group ID, its own offset tracking, completely separate read position. Kafka makes this essentially free. Add another group, get another perspective. No infrastructure changes needed.

With SQS at work, fan-out means SNS into multiple SQS queues. You declare the topology upfront. Want a new consumer? New queue, new subscription, new infra. Kafka just lets readers show up when they're ready. The text accommodates them.

## Fan-in: Nakata collecting cats

Fan-in is many sources converging into one consumer. Nakata wanders the neighbourhood collecting lost cats from different households. Each cat has its own story, but they all end up in the same conversation.

The `memory` consumer does this: it reads from *both* topics, interleaving events into a single chronological record. Multiple producers, one subscriber building a unified view. At work, this pattern shows up constantly, whether it's aggregating events from different services into an analytics pipeline or stitching together an audit trail from disparate sources.

## SSE: the reader at the window

The webapp streams processed events to the browser via Server-Sent Events. I like the fit here: SSE is one-directional and persistent. The browser receives the story as it unfolds. It can't talk back. It can't change what happened. Same relationship a reader has with a novel.

I chose SSE over WebSockets because the dashboard genuinely doesn't need bidirectional communication. The story flows one way. SSE works over HTTP/2 natively and reconnects automatically if the connection drops. Boring choice, right choice.

## What SQS does better

After building this, I appreciate SQS more, not less.

Zero ops. No brokers to manage, no KRaft config to fiddle with, no partition planning. At work, I don't want to think about replication factors at 3am.

Visibility timeout. SQS's approach to "what if the consumer dies mid-processing" is genuinely elegant. The message reappears after a timeout. In Kafka, you manage this yourself through offset commits, and it's your problem if you get it wrong.

Dead letter queues. Native in SQS. Poison messages get routed automatically after N failures. In Kafka, you build your own DLQ topic and handle the routing yourself.

Per-message delay. SQS lets you delay individual messages up to 15 minutes. In Kafka, a message in a partition is immediately available to consumers. If you want delayed processing, that's on your consumer logic.

## What Kafka teaches you that SQS hides

Building this project surfaced concepts SQS deliberately abstracts away:

Partitions are the unit of parallelism. You don't "scale consumers" in Kafka. You scale partitions, then assign consumers to them. Three partitions and five consumers means two consumers sit idle. This forces you to think about data distribution upfront, which SQS never asks you to consider.

Consumer group coordination is real. Rebalancing happens when consumers join and leave. Partitions get reassigned. Your code needs to handle this gracefully, or you get duplicate processing during the transition. SQS just lets you poll from as many instances as you want.

Ordering is a partition-level guarantee only. Want global ordering? One partition (and one consumer). Want parallelism? Multiple partitions, but ordering is only guaranteed within each one. SQS FIFO queues handle this differently, giving you ordering within a message group ID without the partition constraint.

The log is the source of truth. This changes how you think about debugging. When something goes wrong, you rewind the offset and watch it happen again. In SQS, once a message is processed and deleted, your only recourse is whatever you logged.

## RabbitMQ: the cat that follows protocols

If SQS is the well-behaved cat and Kafka is the metaphysical one, RabbitMQ follows AMQP protocols and is quite particular about where messages end up.

Building `the-shore` with RabbitMQ would look different. Exchanges instead of topics, bindings instead of consumer groups, explicit routing keys deciding which queue gets which message. RabbitMQ is smarter about *where* messages go. Kafka doesn't particularly care about routing: everything lands in the topic, and consumers figure out what's relevant to them.

For this project, Kafka was the right fit. The narrative streams don't need routing logic. They need persistence, replay, and multiple independent readers consuming at their own pace. But if `fate` needed to receive only events matching certain patterns (say, only departure events from `tamura-journey`), RabbitMQ's exchange routing would be more natural than consumer-side filtering.

## Things I want to dig into next

- Exactly-once semantics, because `the-stone` alerting twice on the same anomaly is a bug. Idempotent producers and transactional APIs are supposed to solve this, but the tradeoffs aren't obvious yet.
- Schema evolution. What happens when `tamura-journey` events gain new fields? Should `memory` care? Should `fate` break? Avro and the Schema Registry exist for this, but I haven't lived through the pain yet.
- Whether `fate`'s cross-topic correlation could be a Kafka Streams join instead of manual offset tracking. Probably yes. I want to try it.
- Compacted topics. If I only care about where Kafka Tamura *is*, not everywhere he's been, compaction would model that well.
- Cooperative vs eager rebalancing. What actually happens to `the-shore` when a consumer dies mid-processing, and how much control do you get over the transition.

## What I took away

The constraint of modelling a novel's structure forced architectural questions I wouldn't have asked otherwise. How do independent streams correlate? How do consumers with different purposes share infrastructure without stepping on each other? What does "the same event, different interpretation" actually look like in code?

I came out of this appreciating both tools more clearly. SQS when I need managed, fire-and-forget messaging without operational overhead. Kafka when I need replay, high-throughput streaming, or a persistent record that multiple readers can interpret independently.

Also: naming your consumer group after a Murakami location makes debugging logs significantly more enjoyable to read at 2am.
