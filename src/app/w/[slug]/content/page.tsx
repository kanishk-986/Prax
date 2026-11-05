"use client";
import { PageHeader } from "@/components/page-header";
import { RecordList } from "@/components/record-list";
import { fmtDay } from "@/lib/workspace";

const STATUS = ["Idea", "Drafting", "Approved", "Scheduled", "Published"];
const tone: Record<string, string> = { Published: "var(--good)", Approved: "var(--accent)", Scheduled: "var(--accent)", Drafting: "var(--warn)", Idea: "var(--faint)" };

export default function Content() {
  return (
    <div className="mx-auto max-w-[1100px]">
      <PageHeader title="Content" sub="Tuesday long-form article, Thursday single image with the resource prompt, Friday motion video" />
      <RecordList table="posts" order="publish_date" groupBy="status" empty="No posts planned yet. Add the month's posts here."
        defaults={{ status: "Idea", format: "Article" }}
        cols={[
          { key: "publish_date", label: "Date", className: "num whitespace-nowrap text-muted", render: (r) => (r.publish_date ? fmtDay(r.publish_date) : "") },
          { key: "title", label: "Post", className: "font-medium" },
          { key: "format", label: "Format", render: (r) => <span className="chip">{r.format}</span> },
          { key: "status", label: "Status", render: (r) => <span className="chip"><span className="dot" style={{ background: tone[r.status] }} />{r.status}</span> },
          { key: "impressions", label: "Impressions", className: "num text-right", render: (r) => r.impressions?.toLocaleString() ?? "" },
        ]}
        fields={[
          { key: "title", label: "Title or hook", wide: true },
          { key: "format", label: "Format", type: "select", options: ["Article", "Image", "Video", "Carousel", "Text"] },
          { key: "status", label: "Status", type: "select", options: STATUS },
          { key: "publish_date", label: "Publish date", type: "date" },
          { key: "topic", label: "Topic" },
          { key: "resource", label: "Free resource offered", wide: true },
          { key: "draft", label: "Draft", type: "textarea" },
          { key: "url", label: "Live URL", type: "url", wide: true },
          { key: "impressions", label: "Impressions", type: "number" },
          { key: "reactions", label: "Reactions", type: "number" },
          { key: "comments", label: "Comments", type: "number" },
        ]} />
    </div>
  );
}
