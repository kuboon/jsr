import { assertEquals, assertStringIncludes } from "@std/assert";
import { fromHtmlIsomorphic } from "hast-util-from-html-isomorphic";
import { sanitize } from "hast-util-sanitize";
import { toHtml } from "hast-util-to-html";
import { render } from "pele";
import type { Root } from "hast";
import { markdownToHast } from "./mod.ts";
import { mermaidSvgSchema } from "./sanitize.ts";

// One sample of every diagram type Pele draws. The schema is an allow-list of
// exactly what Pele emits, so sanitizing must be a no-op on all of them — a
// Pele upgrade that starts emitting something new fails here, not silently in
// someone's page.
const corpus: Record<string, string> = {
  flowchart: `flowchart TD
  A[Start] --> B{Is it?}
  B -->|Yes| C((OK))
  B -.->|No| D>Flag]
  C ==> E[(DB)]
  subgraph S [サブ]
    E --> F{{hex}}
  end
  classDef red fill:#f00,stroke:#333
  class F red
  style A fill:#bbf
  click A "https://example.com"
  linkStyle 0 stroke:#f00`,
  sequence: `sequenceDiagram
  autonumber
  participant A as Alice
  actor B as Bob
  A->>B: Hi
  B-->>A: Yo
  Note over A,B: note
  loop every
    A-)B: async
  end
  alt x
    A-xB: cross
  else y
    B->>A: ok
  end
  rect rgb(200,200,255)
    A->>A: self
  end`,
  class: `classDiagram
  class Animal {
    +String name
    +eat() void
  }
  Animal <|-- Dog
  Dog *-- Leg
  Dog o-- Toy
  Animal ..> Food
  <<interface>> Animal
  note for Dog "good"`,
  state: `stateDiagram-v2
  [*] --> Still
  Still --> Moving
  Moving --> Crash
  Crash --> [*]
  state Moving {
    [*] --> Fast
  }
  state fork <<fork>>
  note right of Still: hi`,
  er: `erDiagram
  CUSTOMER ||--o{ ORDER : places
  ORDER ||--|{ LINE : contains
  CUSTOMER {
    string name PK
    int age
  }`,
  gantt: `gantt
  title A Gantt
  dateFormat YYYY-MM-DD
  section A
  Task1 :a1, 2024-01-01, 30d
  Task2 :after a1, 20d
  section B
  Task3 :crit, 2024-01-12, 12d
  Milestone :milestone, 2024-02-01, 0d`,
  pie: `pie title Pets
  "Dogs" : 386
  "Cats" : 85
  "Rats" : 15`,
  mindmap: `mindmap
  root((mindmap))
    Origins
      Long history
    Research
      On effectiveness`,
  journey: `journey
  title My day
  section Go to work
    Make tea: 5: Me
    Go upstairs: 3: Me, Cat`,
  git: `gitGraph
  commit
  branch develop
  checkout develop
  commit tag: "v1"
  checkout main
  merge develop
  commit type: HIGHLIGHT`,
  timeline: `timeline
  title History
  2002 : LinkedIn
  2004 : Facebook : Google`,
  quadrant: `quadrantChart
  title Reach
  x-axis Low --> High
  y-axis Low --> High
  quadrant-1 Expand
  quadrant-2 Promote
  quadrant-3 Re-evaluate
  quadrant-4 Improve
  A: [0.3, 0.6]
  B: [0.45, 0.23]`,
  xy: `xychart-beta
  title "Sales"
  x-axis [jan, feb, mar]
  y-axis "Rev" 0 --> 100
  bar [10, 50, 90]
  line [20, 40, 80]`,
  sankey: `sankey-beta
A,B,10
A,C,5
B,D,3`,
  block: `block-beta
  columns 3
  a b c
  d["wide"]:2 e`,
  architecture: `architecture-beta
  group api(cloud)[API]
  service db(database)[DB] in api
  service server(server)[Server] in api
  db:L -- R:server`,
  kanban: `kanban
  Todo
    t1[Write]
  Done
    t2[Ship]`,
  packet: `packet-beta
  0-15: "Source Port"
  16-31: "Dest Port"`,
  requirement: `requirementDiagram
  requirement test_req {
    id: 1
    text: the test text.
    risk: high
    verifymethod: test
  }
  element test_entity {
    type: simulation
  }
  test_entity - satisfies -> test_req`,
  c4: `C4Context
  title System
  Person(a, "User")
  System(b, "Sys")
  Rel(a, b, "Uses")`,
  radar: `radar-beta
  axis A, B, C
  curve c1{1,2,3}
  curve c2{3,2,1}`,
  treemap: `treemap-beta
"Root"
  "A": 10
  "B": 20`,
};

for (const [type, source] of Object.entries(corpus)) {
  Deno.test(`mermaidSvgSchema: keeps all of Pele's ${type} output`, () => {
    const { svg } = render(source, { links: false, images: false });
    const tree = fromHtmlIsomorphic(svg, { fragment: true });
    const before = toHtml(tree);
    assertEquals(toHtml(sanitize(tree, mermaidSvgSchema) as Root), before);
  });
}

Deno.test("rehypeMermaid: click links are not rendered", async () => {
  const html = toHtml(
    await markdownToHast(
      '```mermaid\nflowchart LR\n  A-->B\n  click A "https://example.com"\n```',
    ),
  );
  assertStringIncludes(html, '<div class="mermaid-diagram">');
  assertEquals(html.includes("<a"), false);
  assertEquals(html.includes("example.com"), false);
});

Deno.test("rehypeMermaid: a syntax error becomes a visible message", async () => {
  const html = toHtml(
    await markdownToHast("```mermaid\nflowchart LR\n  A-->\n```"),
  );
  assertStringIncludes(html, '<pre class="mermaid-error">');
});
