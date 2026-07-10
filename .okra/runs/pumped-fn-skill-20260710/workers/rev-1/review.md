{
  "A_COVERAGE_MATRIX": {
    "findings": [
      {
        "item": "I-1..I-32",
        "verdict": "needs-revision",
        "evidence_quote": ".okra/runs/pumped-fn-skill-20260710/workers/dkr-1/idiom-register.md:109 — “the skill should teach every ring-(a)-(e) idiom with a non-invoice micro-example”; many entries exist only as rules or prose, e.g. skills/pumped-fn/references/review.md:42 — “DO atomic aggregate writes” and skills/pumped-fn/references/primitives.md:111 — “prepare({ input }) stages a re-executable invocation.”",
        "fix_needed": "Add an applicable non-invoice micro-example for every thin idiom. Reconcile I-17 with the register."
      },
      {
        "item": "idiom_matrix",
        "verdict": "1 taught, 31 thin, 0 absent",
        "evidence_quote": "All 32 are mentioned somewhere, but only I-21 has a sufficiently complete non-invoice declaration/behavior example under the register’s literal micro-example requirement.",
        "fix_needed": {
          "I-1": "thin — SKILL.md:36 “Keep transport -> capability -> feature”; no complete three-layer micro-example.",
          "I-2": "thin — SKILL.md:35 states root ownership; no boundary/helper counterexample pair.",
          "I-3": "thin — primitives.md:103-108 shows controller composition, but no preset/substitution demonstration.",
          "I-4": "thin — primitives.md:87-111 covers tag deps, but not the complete ambient-fact failure behavior.",
          "I-5": "thin — primitives.md:88-111 defines a port tag, but no root binding/substitution example.",
          "I-6": "thin — SKILL.md:43 states state-versus-stream judgment; no drain-loop example.",
          "I-7": "thin — review.md:41 is only “DO signal after durable commit.”",
          "I-8": "thin — review.md:42 is only “DO atomic aggregate writes.”",
          "I-9": "thin — primitives.md:47 explains parse versus typed, but lacks a boundary protocol-mapping example.",
          "I-10": "thin — testing.md:60 gives one prose shutdown recipe.",
          "I-11": "thin — primitives.md:118-131 shows derived watching but no invalidation assertion.",
          "I-12": "thin — extensions.md:37-49 shows scheduling but no manual-backend deterministic test.",
          "I-13": "thin — SKILL.md:44 and review.md:11 state the naming rule only.",
          "I-14": "thin — SKILL.md:44 omits the full trusted-path null-check/try-catch rule and gives no example.",
          "I-15": "thin — review.md:32 supplies only a violation example.",
          "I-16": "thin — SKILL.md:44/review.md:18 prohibit module state but do not show migration to an atom.",
          "I-17": "thin/wrong — register requires structured domain error classes; SKILL.md:40 instead teaches typed faults and ctx.fail.",
          "I-18": "thin — review.md:13 forbids handle spread but does not show the required thin entry-flow replacement.",
          "I-19": "thin — SKILL.md:44 and review.md:54-56 state ceremony rules without a worked transformation.",
          "I-20": "thin — testing.md:3 states the seam but the graded placement requirement is not met.",
          "I-21": "taught — testing.md:10-26 gives a complete preset-based real-shaped fake and expected behavior.",
          "I-22": "thin — testing.md:33-49 gives gates but not a complete concurrent public-flow test.",
          "I-23": "thin — testing.md:53-60 is lifecycle prose; one claim is also API-incorrect.",
          "I-24": "thin — testing.md:18 contains a type assertion, but its second execution makes the example fail.",
          "I-25": "thin — extensions.md:3-20 attempts a root extension, but its wrappers incorrectly return next.",
          "I-26": "thin — named foreign calls are shown, but workflow step tags and inspect assertions are absent.",
          "I-27": "thin — extensions.md:8-18 attempts wrapExec/wrapResolve but both continuations are wrong.",
          "I-28": "thin — extensions.md:56 is framework-generic prose with no request-boundary example.",
          "I-29": "thin — primitives.md:47 states zero-cost typed inputs but gives no boundary/internal comparison test.",
          "I-30": "thin — primitives.md:111 mentions prepare/ready/exec; no keyed retry/fanout example.",
          "I-31": "thin — SKILL.md:43 covers conflation but never teaches the pull-driven generator contrast.",
          "I-32": "thin — primitives.md:133 states keepAlive/bounded drain but gives no drain/GC example."
        }
      },
      {
        "item": "10 concept-only surfaces",
        "verdict": "1 taught, 7 thin, 2 absent",
        "evidence_quote": "Register lines 90-99 enumerate the ten surfaces. Draft examples include primitives.md:75-80 for resource ownership, while primitives.md:133 only names gc and omits flush; no Hono or incremental-adoption text exists.",
        "fix_needed": {
          "resource ownership/onClose/release": "taught — primitives.md:63-80 gives current ownership, onClose, cleanup, release, and current-versus-boundary semantics.",
          "resource controller watch": "thin — primitives.md:131 states placement but supplies no resource-controller example.",
          "prepare/ready/key": "thin — primitives.md:111 is prose only.",
          "optional/all/tag equality": "thin — optional/all are demonstrated; tag({ eq }) and tag.same are absent.",
          "select/ctrl.set": "thin — select is demonstrated, although with a bad import; set is only named.",
          "GC/flush": "thin — gc and keepAlive are named; enabled, graceMs, and scope.flush() are absent.",
          "React integration": "thin — review.md:21-24 lists prohibited React shapes but gives no positive useFlow/observer architecture.",
          "Hono adapter": "absent — generic framework-boundary prose does not teach @pumped-fn/lite-hono.",
          "incremental adoption": "absent — no legacy-leaf migration shape.",
          "parent-chain tags/service-pattern atom": "thin — undeclared ctx.data reads are prohibited, but seekTag/getTag and the positive service pattern are absent."
        }
      },
      {
        "item": "7 required traps",
        "verdict": "7 taught, 0 thin, 0 absent across the full document set",
        "evidence_quote": "primitives.md:75-80 teaches ownership; SKILL.md:38-42 teaches child controllers, typed<void>(), typed faults/ctx.fail, onClose, watch placement, and select notification semantics.",
        "fix_needed": "Placement remains defective: the precise current-versus-boundary distinction lives only in primitives.md. Move the complete seven-trap teaching into SKILL.md or review.md."
      },
      {
        "item": "I-17 correctness",
        "verdict": "thin",
        "evidence_quote": "Register line 57 — “Throw domain error classes carrying structured fields”; SKILL.md:40 — “Declare planned faults with faults: typed<Fault>() and call ctx.fail(fault).”",
        "fix_needed": "Reconcile the register with current API policy, then teach the ratified distinction between typed planned faults and structured unexpected/domain exceptions."
      }
    ]
  },
  "B_API_CORRECTNESS": {
    "findings": [
      {
        "item": "Three ctx.exec({ fn }) snippets omit required params",
        "verdict": "defect",
        "evidence_quote": "primitives.md:22 — “ctx.exec({ fn: () => hose.water(...), name: \"hose.water\" })”; worked-example.md:51 and extensions.md:26 repeat the shape. pkg/core/lite/src/types.ts:271-275 requires params: Args.",
        "fix_needed": "Add params: [] for zero-argument closures, or accept typed parameters in fn and pass params."
      },
      {
        "item": "wrapExec continuation",
        "verdict": "defect",
        "evidence_quote": "extensions.md:13 — “return next”. Extension continuations are () => Promise<unknown>.",
        "fix_needed": "Return next()."
      },
      {
        "item": "wrapResolve continuation",
        "verdict": "defect",
        "evidence_quote": "extensions.md:16 — “return next”.",
        "fix_needed": "Return next()."
      },
      {
        "item": "Effective execution name",
        "verdict": "defect",
        "evidence_quote": "extensions.md:11-12 logs target.name; pkg/ext/logging/src/index.ts:358 uses ctx.name ?? target.name.",
        "fix_needed": "Use ctx.name ?? target.name so explicit fn/flow invocation names are retained."
      },
      {
        "item": "Invented select export",
        "verdict": "defect",
        "evidence_quote": "primitives.md:116 — “import { atom, controller, createScope, preset, select }”; pkg/core/lite/src/index.ts exports no select.",
        "fix_needed": "Remove select from the import; use scope.select(), as line 125 already does."
      },
      {
        "item": "Testing example executes the effect twice",
        "verdict": "defect",
        "evidence_quote": "testing.md:17 and :18 each call ctx.exec({ flow: waterPlant ... }); line 19 expects calls to equal [250].",
        "fix_needed": "Store one promise, type-check that value, and await the same promise."
      },
      {
        "item": "Commit-before-signal recipe conflicts with close-time commit",
        "verdict": "defect",
        "evidence_quote": "testing.md:60 says run the public flow and assert commit precedes signal; primitives.md:68 places commit in ctx.onClose.",
        "fix_needed": "For resource-backed transactions, put awaited commit and subsequent signal in the same successful onClose callback, or explicitly describe inline store transactions as a separate pattern."
      },
      {
        "item": "Parent-close success claim is overbroad",
        "verdict": "defect",
        "evidence_quote": "testing.md:53 — “A successful invocation is not successful if the parent closes { ok: false, error }.” scope.test.ts:1151-1239 shows current-owned resources settle with each child invocation.",
        "fix_needed": "Limit the statement to resources owned by the parent/boundary; a closed current-owned child cannot be retroactively failed."
      }
    ],
    "defect_count": 10
  },
  "C_REVIEW_MD_CONTRACT": {
    "findings": [
      {
        "item": "24 lint-rule mappings",
        "verdict": "covered",
        "evidence_quote": "pkg/tool/lint/src/index.ts:6-29 contains 24 RuleId literals; review.md:9-32 contains the same 24 names exactly once.",
        "fix_needed": "None."
      },
      {
        "item": "Preference tier distinct from lint tier",
        "verdict": "not-covered",
        "evidence_quote": "review.md:44 “DO child flow controller deps” duplicates no-direct-flow-composition; line 45 duplicates no-unattributed-await; line 47 overlaps implicit-tag/global rules.",
        "fix_needed": "Split mixed rows or label every criterion as preference, lint:<rule>, or mixed so graders cannot double-count machine failures."
      },
      {
        "item": "Preference tier actionability",
        "verdict": "covered",
        "evidence_quote": "review.md:38-56 gives an action, rationale, and violation example for each row.",
        "fix_needed": "Preserve the actionable format while removing or labeling machine-rule overlap."
      }
    ]
  },
  "D_COLD_SESSION_SUFFICIENCY": {
    "findings": [
      {
        "item": "Random sample method",
        "verdict": "deterministic",
        "evidence_quote": "SHA-256(\"pusher_contract:<ring>\"), first 64 bits modulo ring size, sampled rings a/c/e: I-1, I-21, I-32.",
        "fix_needed": "None."
      },
      {
        "item": "I-1 cold behavior",
        "verdict": "thin",
        "evidence_quote": "SKILL.md:36 — “Keep transport -> capability -> feature. Wrap raw IO in a transport atom.”",
        "fix_needed": "A cold session knows the slogan but is not forced through a complete transport/capability/feature implementation and substitution example."
      },
      {
        "item": "I-21 cold behavior",
        "verdict": "taught but misplaced",
        "evidence_quote": "testing.md:13-21 builds a scope with preset(hose, fake), invokes the public flow, closes the context, and disposes the scope.",
        "fix_needed": "Move sufficient graded evidence into SKILL.md or review.md."
      },
      {
        "item": "I-32 cold behavior",
        "verdict": "thin",
        "evidence_quote": "primitives.md:133 — “Use keepAlive: true … scope.drain(feed, { take }) is bounded.”",
        "fix_needed": "Show a bounded drain and a liveness/GC assertion; current prose does not force correct behavior."
      }
    ]
  },
  "E_SIZE_PLACEMENT": {
    "findings": [
      {
        "item": "Entry-file size",
        "verdict": "covered",
        "evidence_quote": "SKILL.md is 61 lines and routes references at lines 53-59.",
        "fix_needed": "None for size."
      },
      {
        "item": "Graded-content placement",
        "verdict": "not-covered",
        "evidence_quote": "SKILL.md:53 says “Read the needed reference before coding,” making deep-reference loading conditional. Required examples for I-21 and lifecycle semantics live in testing.md/primitives.md rather than SKILL.md or review.md.",
        "fix_needed": "Put every graded rule and sufficient cold-session example directly in SKILL.md or review.md. Keep other references supplemental."
      }
    ]
  },
  "coverage_counts": {
    "idioms": {
      "taught": 1,
      "thin": 31,
      "absent": 0
    },
    "concept_only_surfaces": {
      "taught": 1,
      "thin": 7,
      "absent": 2
    },
    "traps_full_document_set": {
      "taught": 7,
      "thin": 0,
      "absent": 0
    },
    "traps_graded_placement": {
      "taught": 6,
      "thin": 1,
      "absent": 0
    }
  },
  "overall_verdict": {
    "verdict": "needs-revision",
    "minimal_revision_list_ranked": [
      "Fix the 10 API defects; five snippets currently do not typecheck or execute their target.",
      "Move all graded teaching into SKILL.md or review.md, especially ownership, testing, prepare, and bounded-drain material.",
      "Add non-invoice micro-examples for the 31 thin idioms, prioritizing I-7, I-8, I-10, I-17, I-26, I-30, and I-31.",
      "Complete the concept-only surfaces: Hono and incremental adoption are absent; equality, GC/flush, React, prepare, resource-watch, select/set, and parent-chain/service patterns are incomplete.",
      "Separate preference-only review criteria from lint-backed or mixed criteria.",
      "Reconcile I-17’s register requirement with the typed-fault/ctx.fail rule."
    ]
  }
}