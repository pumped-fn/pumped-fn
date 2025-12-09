# Pumped-fn Project Instructions

# Prerequisites

This repo requires `c3-skill` and `superpowers` skill sets. If you encounter tool not found or skill not found related to c3 or superpowers, please have a look at ./troubleshooting.md

Diagrams mean a thousand words, mermaid chart is worth even more, because they are short; make and use diagrams to communicate, make comments, give feedback, and request reviews. On responding on getting feedbacks/conversational (not doc), use mermaid.live link

<workflows>
  <workflow>
    <target>
      adding new features, add more packages, fix bugs
    </target>
    
    <steps>
      <step>
        <description>Understand the current structure</description>
        <works>
          use /c3-skill:c3-use to discover c3
        </works>
      </step>
      <step>
        <description>Analyze conflicts or potential conflicts</description>
        <works>
          check through the list of ADR's frontmatter to see if there's any matches
          if there's none, then we can move on to working on details
          if there's some, we'll need to use /supowerpowers:brainstorming to analyze the requirement
        </works>
      </step>
      <step>
        <description>Propose a change</description>
        <works>
          everything must be addressed in form of ADR, as such, use /c3-skill:c3 along with /superpowers:brainstorming to form up the changes
        </works>
      </step>
      <step>
        <description>Break to tasks</description>
        <works>
          once the scoped are defined, and refined. Clean up for all superficial details, be efficient. Task should be done and review in parallel manner to save time
          moving on use /superpowers:write-plan, but instead of writing to a file, we'll use beads to store all tasks, with the epic to be derived from ADR
          the tasks should also cover in the final stage
          - cleanup all of superficial, don't waste everyone's time reviewing bullshits
          - run /c3-skill:c3-audit to do the audit, if there are a lot of changes, address them again via beads within the same epic
        </works>
      </step>
      <step>
        <description>Accomplishing</description>
        <works>
          most of the works require PR, prior to PR, we'll need
          - all tasks of epics are done
          - moving ADR to approved
          - update corresponding docs
          - c3-audit is surely done
          - changelog created, always start with minor, unless otherwise stated
          - most of packages will have README file, README file ALWAYS contain how the library work via diagrams, API should ALWAYS be disclosed by the generated .d.mts or d.cts, so we SHOULD not include those in the README. After a change, we'll need to change/ or create the README
        </works>
      </step>
    </steps>
  </workflow>

  <workflow>
    <target>
      taking works
    </target>
    <steps>
      <step>
        <description>check ready to go work. Focus on get things done rather than having way too many epics at the same time</description>
        <works>use `bd ready` to pick up the highest priority</works>
      </step>
      <step>
        <description>follow instruction strictly, fail fast and loud, request to change to the details is much more important than being fast</description>
        <works>get the job done</works>
      </step>
    </steps>
  </workflow>
</workflows>
