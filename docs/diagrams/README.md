# Process digraphs

Six Graphviz digraphs, one per process, each from start to done. They
are part of the Sudus 2 feature specification in docs/spec/sudus-v2.md.

- install.dot: from a harness with no Sudus to the command, hooks and skills.
- spec-phase.dot: the tail the three entry flows share, from drafted requirements to the first action.
- new-project.dot: from an empty directory to an Agreed first commitment.
- existing-project.dot: from an unspecified or drifted codebase, or a pending supersession, to one prepared commitment.
- next-feature.dot: from Done to the next Agreed commitment.
- work-loop.dot: wake names one action with its completion predicate; the agent does it; wake again.

Render with Graphviz:

    for f in install new-project existing-project next-feature spec-phase work-loop; do
      dot -Tsvg docs/diagrams/$f.dot -o docs/diagrams/$f.svg
    done

The .dot sources are the record; the .svg files are kept so the graphs
can be read without a renderer. Where a graph and the specification
text disagree, the text is normative: the predicates live there.
