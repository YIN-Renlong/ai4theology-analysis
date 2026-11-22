# AI4Theology · Whose thinking?

An explorable research edition of YIN Renlong’s [“Whose Thinking Is Being Assessed? The Unsettled Boundary Between Assistance and Authorship in AI-Assisted Education”](https://www.yin.roma.it/2026/10/whose-thinking-is-being-assessed-the-unsettled-boundary-between-assistance-and-authorship-in-ai-assisted-education/).

The complete reader combines the Synoptic Edition’s typography and parallel readings with the Itinerary’s changing argument maps. Eleven chapters follow the opening comparison through theological examples and questions about later understanding. Two featured episodes foreground the repair of the original question and responsibility for an argument developed through assistance. An evidence explorer exposes every proposed relationship, and the language view links descriptive counts to the passages behind them. The full extracted article and its reference section remain available below the guided reading.

Live edition: https://yin-renlong.github.io/ai4theology-analysis/

## Run locally

On a Mac, double-click **Start Demo.command** after extracting the ZIP, or run
`python3 scripts/preview.py` from the project directory. This opens the browser
and uses an available local port, so an existing ChainForge server can keep running.

Python 3.9 or newer is sufficient. The data pipeline uses the standard library. There is no package installation, API key, or language-model call.

From the repository directory:

```bash
python3 scripts/build_data.py
python3 scripts/analyze_collaboration.py
python3 scripts/build_edition.py
python3 -m unittest discover -s tests -v
python3 -m http.server 8000 --directory site
```

Open `http://localhost:8000`. Keep the terminal running while viewing the site; press Control+C to stop it. A local HTTP server is needed to load the JavaScript modules. The reading and full article are rendered into the HTML at build time, with the verified data embedded for the interactive views.

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
| `site/data/edition-chapters.json` | Eleven editorial reading chapters, with source anchors and map assignments |

`data/edition-chapters.json` is the editable reading sequence. After changing it, run `python3 scripts/build_edition.py`. The builder checks quotation anchors and coverage of all analytical records before writing `site/index.html`. The template is `site/edition-template.html`; presentation code is in the `site/edition*` files. Older demo assets remain in the repository for continuity but are not loaded by the new reader.

## What the counts mean

The original analysis contained **21 proposed interpretation records and 16 proposed relationships**. The visual edition contains **25 records and 21 relationships**. It adds three propositions unpacking the theological inference and one record preserving a recurring objection. It also changes “supports” to “acknowledges” for the assistant’s response and specifies that the author questions a caution’s relevance.

The original **118 content blocks, 29 reference-section blocks, and 53 body hyperlinks** retain their original meanings. Reference-section blocks are not a count of distinct scholarly sources. Counts of selected analytical records are not shares of authorship or measures of learning. Original and enriched counts are stored separately, and every addition appears in the revision log.

## Evidence and interpretation

All analytical annotations remain `proposed_by_assistant`. An exact text match establishes where a proposed interpretation is anchored; it does not establish that the interpretation is correct or approved by the researcher.

The source is a published article containing retrospective accounts, hypothetical examples, and later scholarly reading. Ten selected original excerpts from messages M57–M62 are now aligned to the published account. The full private conversation is not included. Message labels establish export order, not dates; article alignments remain proposed interpretations. The guided visual order is an editorial reading sequence. Relationship arrows have explicit analytical meanings and are not automatically chronological or causal connections.

The demo supports examining expressed reasoning and the development of an argument. It does not prove a learning effect, reconstruct private mental states, or assign a percentage of human or AI authorship. Citations represent the article’s engagement with sources; this exporter does not verify the cited publications themselves.

## Prova3: original exchanges and the research question

The reading now foregrounds the authorship case and its pedagogical question. A revised recurrence graphic accompanies the original question, its substitution, the assistant’s acknowledgment and the renewed objection. Close-reading panels expose the existing conclusion/justification coding within the article’s reading sequence.

`data/inquiry-sources.json` contains ten scoped excerpts from the preserved original conversation, with readable display text and exact original wording. Each has Unicode character offsets and SHA-256 fingerprints. The evidence panel connects these excerpts to published paragraphs. The method section also contains a readable source appendix for visitors without JavaScript. No unrelated conversations or complete private export are published.

The source audit establishes a detail that the earlier reconstruction left less precise: the acknowledgment and recurring qualification both occur in M60, followed by the renewed question in M61. Their educational significance remains an interpretive question. These records do not yet contain a separately dated post-article explanation; the later return described in the essay retains its status as a published account.

Validate the public selection:

```bash
python3 scripts/inquiry_sources.py
```

If you have the original UTF-8 export, verify every selected excerpt against it locally:

```bash
python3 scripts/inquiry_sources.py --source /absolute/path/to/original-chat-export.txt
```

The optional verifier reads that export without copying or uploading it. The build checks excerpt integrity and valid paragraph references, then embeds only the selected public records. Fingerprint checks establish source consistency; they do not approve the interpretation or the readability edits. Alignments remain `proposed_by_assistant` until an actual review is recorded.

The descriptive report still concerns the six article-based episode interpretations. Adding the original excerpt selection does not inflate episode frequencies, create a new learner sample, or turn the graph into a causal learning model.

## Reproduce the collaboration analysis

Run `python3 scripts/analyze_collaboration.py` after rebuilding the base data. This is a deterministic Python standard-library pipeline; it needs no API key and sends no article text to an external model. The GitHub Pages workflow runs it on every deployment. The edition builder rejects analytical results whose input hashes no longer match the source data or coding files.

The input codebook is `data/collaboration-codebook.json`. Selected episode interpretations are in `data/collaboration-episodes.json`. These are explicit assistant-proposed annotations for researcher review, not results automatically discovered by Python. Each pattern has an inclusion and exclusion rule. Episode changes distinguish the conclusion from its justification and allow `not_established`.

The script computes:

- Coverage of source body blocks by the selected annotations; relation-type distributions and evidence-basis counts. Candidate pattern prevalence counts the supplied episode assignments, with a clearly stated denominator.
- Directed shortest paths through the current 25-node graph, and a complete TF–IDF cosine similarity matrix for eligible body paragraphs, with a separate shortlist of nonadjacent matches. Paths record connectivity through assigned relations; they do not establish chronological or transitive inferential chains. Similarity identifies shared vocabulary for close reading; it is not a learning score or a semantic entailment test.

The report records input SHA-256 hashes and the lexical retrieval settings. Reference-section blocks are excluded from body statistics. Hypothetical examples and later reading retain their evidence labels. No transition probability, learning-effect estimate, or authorship percentage is calculated from this article.

| Output in `site/data/` | Purpose |
| --- | --- |
| `collaboration-analysis.json` | Complete computed results, selected episodes, graph paths and lexical matches |
| `collaboration-codebook.json` | Public definitions and interpretation rules |
| `collaboration-episodes.csv` | Inspectable episode coding and proposed changes |
| `collaboration-relations.csv` | Existing directed relationships and their analytical families |
| `collaboration-report.md` | Readable descriptive results and methodological limits |

The website's **Patterns** section provides the episode-pattern matrix and passage-linked coverage display. Its language comparisons open the original paragraphs. Empty matrix cells mean that a pattern was not assigned in this selected coding; they do not prove that it is absent from the wider inquiry.

Relevant methodological foundations include [Chi and Wylie's ICAP framework (2014)](https://education.asu.edu/sites/g/files/litvpz656/files/lcl/chiwylie2014icap_2.pdf), [Lawrence and Reed's argument-mining survey (2019)](https://aclanthology.org/J19-4006/), and [Shaffer and Ruis on epistemic network analysis (2017)](https://www.solaresearch.org/publications/hla-17/hla17-chapter15/). This implementation does not claim to implement or validate ICAP or ENA. It supplies an evidence-linked coding framework that could support later, appropriately designed analysis.

## Contextual analysis and whole-episode views

`data/contextual-codebook.json` supplies 34 proposed contextual readings across 31 of the 118 body passages. Each reading distinguishes the subject of a claim from its argumentative use and includes an exact source quotation. These are selected close readings, not exhaustive automated semantic classification. The same paragraph can carry several concept codes; an empty cell means no reading was assigned in this selection.

`scripts/contextual_analysis.py` verifies unique quotation matches, rejects duplicate concept–passage assignments, and computes the concept-by-section counts. The edition embeds only results whose input hashes match the current coding files. Its contextual heatmap opens the proposed interpretation and source passage. Public outputs include `site/data/contextual-codebook.json` and `site/data/contextual-readings.csv`.

The lexical graphic compares all 115 eligible body passages (at least 25 words), giving 6,555 distinct non-self pairs. The matrix is symmetric and uses TF–IDF cosine similarity on a 0–1 scale; adjacent passages are included here. Both axes follow publication order. This detects shared vocabulary, without claiming semantic agreement or historical influence. Passage menus and keyboard controls provide an alternative to selecting a square. A second, switchable arc view shows the strongest qualifying nonadjacent pairs across publication order; it uses the same cosine values and opens the same passage comparisons. These connections are undirected vocabulary similarities. The displayed score threshold and body-passage gap define selection, while arc height represents distance in the article, not strength. Both views appear directly after “Different links answer different questions”. No embeddings or language-model classification calls are involved.

The conclusion–justification matrix counts the six selected episode classifications, with an evidence-basis filter. It retains unresolved and not-established states and labels the hypothetical case. Counts do not establish gains in understanding.

**Whole episode** shows every recorded relationship whose endpoints belong to the chosen episode. It adds no reverse arrows or inferred links. The initial E02 view includes the renewed objection after acknowledgment. Curves distinguish argument relations from interaction responses and reported order; each relationship has an evidence control and equivalent text entry. **Nearby connections** remains available for examining an individual annotation. The searchable catalogue is collapsed initially; the selected interpretation and its graph remain adjacent without a catalogue-sized empty area.

## Presentation and accessibility

The public interface combines a guided scroll sequence with a chapter selector and focused relationship maps. Evidence panels preserve source passages; their labels may paraphrase them. A complete text search includes the reference section. All 25 annotations and 21 relationships are individually inspectable. Contextual readings show concept-by-section counts and exact supporting passages. The word concordance remains available as a separate literal index.

The desktop reading keeps its graphic beside the text. On narrow screens, each chapter contains its own graphic. Reduced-motion controls and the operating-system preference preserve complete readable states. The relationship map has an equivalent text list and keyboard-operable controls. The static reading and full article remain available without JavaScript. Map coordinates are editorial arrangements, not measured cognitive distance or learning scores.

## GitHub Pages

The workflow in `.github/workflows/pages.yml` rebuilds the data, runs the collaboration analysis, builds the complete edition, runs the Python tests, and deploys the `site` directory using GitHub Pages. It runs on pushes to `main` or `master`, and can also be started manually.

The repository’s Pages publishing source must be **GitHub Actions**. The workflow uses the `github-pages` environment and the repository-provided `GITHUB_TOKEN`; no personal token is stored in the project. It publishes the public article data along with the website.

### Update the existing repository

If you downloaded this complete package, double-click **Update GitHub.command** on your Mac, or run `python3 scripts/update_github.py`. It checks that GitHub CLI is signed in as **YIN-Renlong**, prepares the update in a temporary clone of **YIN-Renlong/ai4theology-analysis**, rebuilds and tests it, then pushes without force. It waits for the Pages deployment for that exact commit and opens the published URL on success. Your existing local project is not overwritten. Use `--prepare-only` to check the prepared update without pushing. Git and GitHub CLI are required; `gh auth login` signs in when needed.

In a checkout of `YIN-Renlong/ai4theology-analysis`, rebuild and test using the commands above, then commit and push the changes. The push triggers Pages deployment. Check the Actions result before sharing a new version. `scripts/publish_github.py` is an initial-publication helper; it intentionally refuses to overwrite an already populated repository.

### Initial publication to an empty repository

The fallback publisher requires Git and the [GitHub CLI](https://cli.github.com/). Authenticate the CLI as **YIN-Renlong** first:

```bash
gh auth login
python3 scripts/publish_github.py --repo YIN-Renlong/ai4theology-analysis
```

It verifies the authenticated account before making changes. The default target is `YIN-Renlong/ai4theology-analysis`. If that repository does not exist, the script creates it as public. It uploads only to an absent or empty repository, enables GitHub Pages, and starts the workflow. A populated repository is left untouched so its existing site can be inspected before integration.

The script works through a temporary checkout and preserves the current local project. It never force-pushes or writes credentials to files. An optional `--repo YIN-Renlong/NAME` argument supports a different repository explicitly chosen by you. A started workflow is not a verified live deployment; check its Actions result before sharing the Pages URL.

## Third-party animation libraries

The bundled GSAP 3.14.2 files are distributed under the [GSAP Standard License](https://gsap.com/standard-license/). Their copyright and license notices are retained in the vendor files. GSAP’s terms apply to those files; this repository does not relicense them.

Research and conception: **YIN Renlong**, Faculty of Theology and Religion, University of Oxford. Implementation and provisional analytical coding were developed with AI assistance.
