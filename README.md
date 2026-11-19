# AI4Theology · Whose thinking?

An explorable research edition of YIN Renlong’s [“Whose Thinking Is Being Assessed? The Unsettled Boundary Between Assistance and Authorship in AI-Assisted Education”](https://www.yin.roma.it/2026/10/whose-thinking-is-being-assessed-the-unsettled-boundary-between-assistance-and-authorship-in-ai-assisted-education/).

The demo follows the development of a question about equivalent human and AI assistance. Scroll-controlled text transformations make selected relationships visible. A comparison view exposes changed assumptions; an interactive map connects interpretations to their source passages.

## Run locally

On a Mac, double-click **Start Demo.command** after extracting the ZIP, or run
`python3 scripts/preview.py` from the project directory. This opens the browser
and uses an available local port, so an existing ChainForge server can keep running.

Python 3.9 or newer is sufficient. The data pipeline uses the standard library. There is no package installation, API key, or language-model call.

From the repository directory:

```bash
python3 scripts/build_data.py
python3 -m unittest discover -s tests -v
python3 -m http.server 8000 --directory site
```

Open `http://localhost:8000`. Keep the terminal running while viewing the site; press Control+C to stop it. A local HTTP server is needed because the page loads its JSON data through `fetch`.

The generated site is static. GSAP and ScrollTrigger are included locally under `site/vendor`, so those animations do not depend on a CDN request.

## Reproduce the analysis export

The supplied archive `data/analysis-to-share.zip` contains the published article’s extracted text, the original structured analysis, and its manifest. It supplies the input for:

```bash
python3 scripts/build_data.py
```

To select another compatible analysis archive explicitly:

```bash
python3 scripts/build_data.py --input /absolute/path/to/analysis-to-share.zip
```

The exporter verifies the returned record and report against their manifest hashes, checks annotation offsets against the extracted passages, and rejects missing or ambiguous new anchors. It does not independently verify the original HTML’s hash because that raw HTML is not included in the returned archive.

The public outputs are:

| File | Contents |
| --- | --- |
| `site/data/analysis.json` | Enriched records used by the visualisation, source passages, comparisons, and descriptive counts |
| `site/data/research-record.json` | Original analysis, source audit, and the changes made for the visual edition |

## What the counts mean

The original analysis contained **21 proposed interpretation records and 16 proposed relationships**. The visual edition contains **25 records and 21 relationships**. It adds three propositions unpacking the theological inference and one record preserving a recurring objection. It also changes “supports” to “acknowledges” for the assistant’s response and specifies that the author questions a caution’s relevance.

The original **118 content blocks, 29 reference-section blocks, and 53 body hyperlinks** retain their original meanings. Reference-section blocks are not a count of distinct scholarly sources. Counts of selected analytical records are not shares of authorship or measures of learning. Original and enriched counts are stored separately, and every addition appears in the revision log.

## Evidence and interpretation

All analytical annotations remain `proposed_by_assistant`. An exact text match establishes where a proposed interpretation is anchored; it does not establish that the interpretation is correct or approved by the researcher.

The source is a published article containing retrospective accounts, hypothetical examples, and later scholarly reading. The original conversation has not been independently aligned here. The guided visual order is an editorial reading sequence. Relationship arrows have explicit analytical meanings and are not automatically chronological or causal connections.

The demo supports examining expressed reasoning and the development of an argument. It does not prove a learning effect, reconstruct private mental states, or assign a percentage of human or AI authorship. Citations represent the article’s engagement with sources; this exporter does not verify the cited publications themselves.

## Presentation and accessibility

The public interface combines a guided scroll sequence with step buttons and a focused relationship map. Evidence panels preserve the source passages. Diagram labels may paraphrase those passages. Reduced-motion controls preserve complete readable states, and the map also has selection controls for accessing its evidence.

## GitHub Pages

The workflow in `.github/workflows/pages.yml` rebuilds the data, runs the Python tests, and deploys the `site` directory using GitHub Pages. It runs on pushes to `main` or `master`, and can also be started manually.

The repository’s Pages publishing source must be **GitHub Actions**. The workflow uses the `github-pages` environment and the repository-provided `GITHUB_TOKEN`; no personal token is stored in the project. It publishes the public article data along with the website.

### Publish from your Mac

The fallback publisher requires Git and the [GitHub CLI](https://cli.github.com/). Authenticate the CLI as **YIN-Renlong** first:

```bash
gh auth login
python3 scripts/publish_github.py
```

It verifies the authenticated account before making changes. The default target is `YIN-Renlong/ai4theology`. If that repository does not exist, the script creates it as public. It uploads only to an absent or empty repository, enables GitHub Pages, and starts the workflow. A populated repository is left untouched so its existing site can be inspected before integration.

The script works through a temporary checkout and preserves the current local project. It never force-pushes or writes credentials to files. An optional `--repo YIN-Renlong/NAME` argument supports a different repository explicitly chosen by you. A started workflow is not a verified live deployment; check its Actions result before sharing the Pages URL.

## Third-party animation libraries

The bundled GSAP 3.14.2 files are distributed under the [GSAP Standard License](https://gsap.com/standard-license/). Their copyright and license notices are retained in the vendor files. GSAP’s terms apply to those files; this repository does not relicense them.

Research and conception: **YIN Renlong**. Implementation and provisional analytical coding were developed with AI assistance.
