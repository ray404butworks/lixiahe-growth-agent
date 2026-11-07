"use client";

type Action = { label: string; onClick: () => void };

export function WorkspaceEmptyState({
  title,
  primary,
  secondary,
}: {
  title: string;
  primary: Action;
  secondary?: Action;
}) {
  return (
    <section className="workspace-empty">
      <h2>{title}</h2>
      <div className="workspace-empty-actions">
        <button
          type="button"
          className="button primary"
          onClick={primary.onClick}
        >
          {primary.label}
        </button>
        {secondary && (
          <button
            type="button"
            className="text-button"
            onClick={secondary.onClick}
          >
            {secondary.label}
          </button>
        )}
      </div>
    </section>
  );
}
