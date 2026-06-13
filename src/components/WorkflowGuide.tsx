interface WorkflowGuideProps {
  title: string;
  purpose: string;
  when: string;
  nextAction: string;
}

export function WorkflowGuide({ title, purpose, when, nextAction }: WorkflowGuideProps) {
  return (
    <section className="workflow-guide" aria-label={title}>
      <div className="workflow-guide-lead">
        <span>Workflow guide</span>
        <h2>{title}</h2>
      </div>
      <div className="workflow-guide-item">
        <span>What this is for</span>
        <p>{purpose}</p>
      </div>
      <div className="workflow-guide-item">
        <span>When to use it</span>
        <p>{when}</p>
      </div>
      <div className="workflow-guide-item">
        <span>Next action</span>
        <p>{nextAction}</p>
      </div>
    </section>
  );
}
