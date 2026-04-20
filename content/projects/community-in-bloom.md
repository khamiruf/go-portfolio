---
title: "Community in Bloom"
date: "2026-04-09"
tags: ["bun", "vite", "leafletjs"]
---

![alt text](/assets/media/cib.gif)

After a chat with some researchers, it turns out that [community gardeners](https://gardeningsg.nparks.gov.sg/get-involved/community-gardens/) actually do know about the [Community In Bloom (CIB)](https://gardeningsg.nparks.gov.sg/page-index/programming/cib-awards/) (*you can even apply to be a part of the programme [here](https://form.gov.sg/64b78ef1a218a40012387fa4)*) programme. [NParks](https://www.nparks.gov.sg/) initiated it to foster community and stewardship, which is government-speak for "let’s all grow veggies and plants together and try not to argue over the whose turn is it to water the damn plants (or fight bugs off the plants)."

The gardeners also knew they could technically find other gardens via a map AND they **do** want to find them. To meet with other fellow gardeners, exchange trade secrets on how to *"build"* more resilient plants, and even share crops. However, through a series of unfortunate navigational events, most ended up stranded on this [data.gov.sg](https://data.gov.sg/datasets/d_f91a8b057cfb2bebf2e531ad8061e1c1/view) landing page—a place where hope goes to die and CSV files go to live. They had no clue how to actually see a map from there.

## Questions I Have (and Existential Dread)

- Discoverability: This dataset is excellent, but why isn't it featured more prominently on the main NParks site? (My thoughts: popularity / the lack of demand perhaps?)

- The "Why did I build this?" Moment: Why did nobody (myself included) know that OpenGov had already built this tool? It’s a perfectly functional map that does exactly what I set out to do.
    - *I opined that this wasn't a result whenMy theory: Searching for "Community in Bloom" doesn't actually lead you there. The tool isn't exactly marketed with the same zeal as parking.sg (a masterpiece, no notes).
    - Finding the OpenGov version made my own project feel slightly redundant, but we’re committed now. We’re in the "sunk cost" phase of the hobby.

## How it works
*Feel free to try it out [here](https://community-in-bloom.pages.dev/).* [(source code)](https://github.com/khamiruf/community_in_bloom)

The API doesn't just hand you a file; it responds with an S3 blob. If you try to fetch that directly from the client, you’ll be greeted by the cold, unyielding wall of CORS issues, because the S3 bucket and your app aren't exactly on speaking terms.

To bypass this, we fetch and populate the data server-side first.

```js
// Separate function call that runs onRequest
geojson = await (await fetch('/geojson')).json();

// The main logic (handling the S3 scavenger hunt)
const POLL_URL = 'https://api-open.data.gov.sg/v1/public/api/datasets/d_f91a8b057cfb2bebf2e531ad8061e1c1/poll-download';

export async function onRequest() {
  // First, we ask the API where the file actually is
  const pollRes = await fetch(POLL_URL);
  const pollData = await pollRes.json();
  const s3Url = pollData.data.url;

  // Then we go get the data ourselves so the browser doesn't panic
  const dataRes = await fetch(s3Url);
  const data = await dataRes.arrayBuffer();

  return new Response(data, {
    headers: {
      'Content-Type': 'application/geo+json',
      'Cache-Control': 'public, max-age=3600',
    },
  });
}
```

More posts soon—assuming I don't find another government tool that has already solved my next three problems.
