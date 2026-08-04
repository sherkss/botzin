# Third-party data notices

## TibiaWiki on Fandom — NPC transcripts and in-game book texts

The generated Tibia knowledge snapshot can contain transformed text retrieved from pages under
`https://tibia.fandom.com/`. The site's MediaWiki API reports the text license as
[CC BY-SA 3.0](https://creativecommons.org/licenses/by-sa/3.0/).

Each generated `npc-dialogue` and `book` record retains its source/attribution URL, revision identifier when provided,
license identifier, license URL, and a description of the transformations applied by Botzin. The transformation
removes wiki markup and structures player prompts, keywords, conditions, NPC names, and responses. Derived
transcript data remains subject to CC BY-SA 3.0. Images are not imported.

Book records preserve the original English text. PT-BR text generated with Argos Translate is identified as an
automatic translation and is also a derivative of the attributed source; it must not be treated as an official
CipSoft translation. Numeric-only texts, including 469 evidence, are preserved verbatim.

Tibia and related in-game content are property of CipSoft GmbH. Community statements are not treated as official
game facts unless separately confirmed by an official source.

## TibiaWiki.com.br

Botzin stores reference links and short factual summaries for comparison, including the unresolved 469 topic.
It does not bulk-copy TibiaWiki.com.br: its MediaWiki API returned HTTP 403 during integration and its copyright
notice states that its content is all rights reserved. A future direct connector requires explicit permission or
an API/data export offered by the site.
