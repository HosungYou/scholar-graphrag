"""
Report Generator — converts a project summary dict into Markdown or HTML reports.
"""

from datetime import datetime


# ---------------------------------------------------------------------------
# Quality metric interpretation helpers
# ---------------------------------------------------------------------------

def _interpret_modularity(val: float) -> str:
    if val >= 0.6:
        return "강함"
    if val >= 0.4:
        return "보통"
    return "약함"


def _interpret_silhouette(val: float) -> str:
    if val >= 0.5:
        return "명확한 군집"
    if val >= 0.25:
        return "중간"
    return "군집 경계 불분명"


def _interpret_coherence(val: float) -> str:
    if val >= 0.7:
        return "높음"
    if val >= 0.4:
        return "보통"
    return "낮음"


def _interpret_coverage(val: float) -> str:
    pct = val * 100
    if pct >= 90:
        return "우수"
    if pct >= 70:
        return "양호"
    return "개선 필요"


def _pct(val) -> str:
    """Format a 0-1 float as percentage string."""
    try:
        return f"{float(val) * 100:.1f}%"
    except (TypeError, ValueError):
        return "N/A"


def _fmt(val, decimals: int = 3) -> str:
    """Format a float."""
    try:
        return f"{float(val):.{decimals}f}"
    except (TypeError, ValueError):
        return "N/A"


# ---------------------------------------------------------------------------
# Main public function
# ---------------------------------------------------------------------------

def generate_markdown_report(summary: dict, project_name: str) -> str:
    """
    Convert a project summary dict (from GET /api/graph/summary/{project_id})
    into a structured Korean Markdown report.

    Args:
        summary: The summary dict returned by the summary endpoint.
        project_name: Human-readable project name.

    Returns:
        Markdown string.
    """
    today = datetime.utcnow().strftime("%Y-%m-%d")
    lines: list[str] = []

    # ---- Title ----
    lines += [
        f"# 연구 지형 리포트: {project_name}",
        f"생성일: {today}",
        "",
    ]

    # ---- Overview ----
    overview = summary.get("overview", {})
    total_papers = overview.get("total_papers", 0)
    total_entities = overview.get("total_entities", 0)
    total_relationships = overview.get("total_relationships", 0)
    entity_types = overview.get("entity_type_distribution", {})

    lines += [
        "## 개요",
        "",
        f"- 논문 **{total_papers}**편, 엔티티 **{total_entities}**개, 관계 **{total_relationships}**개",
    ]

    if entity_types:
        lines.append("- 엔티티 유형 분포:")
        for etype, count in sorted(entity_types.items(), key=lambda x: -x[1]):
            lines.append(f"  - {etype}: {count}개")

    lines.append("")

    # ---- Quality Metrics ----
    metrics = summary.get("quality_metrics", {})
    modularity = metrics.get("modularity_raw")
    silhouette = metrics.get("silhouette")
    coherence = metrics.get("coherence")
    entity_diversity = metrics.get("entity_diversity")
    paper_coverage = metrics.get("paper_coverage")

    lines += [
        "## 품질 지표",
        "",
        "| 지표 | 값 | 해석 |",
        "|------|-----|------|",
    ]

    if modularity is not None:
        lines.append(f"| 모듈러리티 | {_fmt(modularity)} | {_interpret_modularity(modularity)} |")
    if silhouette is not None:
        lines.append(f"| 실루엣 점수 | {_fmt(silhouette)} | {_interpret_silhouette(silhouette)} |")
    if coherence is not None:
        lines.append(f"| 주제 일관성 | {_fmt(coherence)} | {_interpret_coherence(coherence)} |")
    if entity_diversity is not None:
        lines.append(f"| 엔티티 타입 다양성 | {_pct(entity_diversity)} | {'풍부' if entity_diversity >= 0.7 else '보통'} |")
    if paper_coverage is not None:
        lines.append(f"| 논문 커버리지 | {_pct(paper_coverage)} | {_interpret_coverage(paper_coverage)} |")

    lines.append("")

    # ---- Top Entities ----
    top_entities = summary.get("top_entities", [])
    if top_entities:
        lines += [
            "## 핵심 개념 (상위 10개)",
            "",
        ]
        for i, entity in enumerate(top_entities[:10], 1):
            name = entity.get("name", "Unknown")
            etype = entity.get("entity_type", "")
            pagerank = entity.get("pagerank", 0.0)
            lines.append(f"{i}. **{name}** ({etype}) — PageRank: {_fmt(pagerank)}")
        lines.append("")

    # ---- Communities ----
    communities = summary.get("communities", [])
    if communities:
        lines += [
            "## 연구 커뮤니티",
            "",
        ]
        for cluster in communities:
            cluster_id = cluster.get("cluster_id", "?")
            label = cluster.get("label") or f"클러스터 {cluster_id}"
            size = cluster.get("size", 0)
            concept_names = cluster.get("concept_names", [])

            lines += [
                f"### 클러스터 {cluster_id}: {label} ({size}개 개념)",
                "",
            ]
            if concept_names:
                top_names = concept_names[:5]
                lines.append(f"- 주요 개념: {', '.join(top_names)}")
                if len(concept_names) > 5:
                    lines.append(f"- 외 {len(concept_names) - 5}개 개념")
            lines.append("")

    # ---- Structural Gaps ----
    gaps = summary.get("structural_gaps", [])
    if gaps:
        lines += [
            "## 구조적 갭 및 연구 기회",
            "",
        ]
        for i, gap in enumerate(gaps[:5], 1):
            cluster_a = gap.get("cluster_a_label", gap.get("cluster_a_id", "A"))
            cluster_b = gap.get("cluster_b_label", gap.get("cluster_b_id", "B"))
            strength = gap.get("gap_strength", 0.0)
            questions = gap.get("research_questions", [])

            lines += [
                f"### 갭 {i}: [{cluster_a}] ↔ [{cluster_b}]",
                "",
                f"- 강도: {_fmt(strength)}",
            ]
            if questions:
                lines.append("- 연구 질문:")
                for q in questions[:3]:
                    lines.append(f"  - {q}")
            lines.append("")

    # ---- Temporal Info ----
    temporal = summary.get("temporal_info", {})
    min_year = temporal.get("min_year")
    max_year = temporal.get("max_year")
    emerging = temporal.get("emerging_concepts", [])

    if min_year or max_year or emerging:
        lines += [
            "## 시간적 트렌드",
            "",
        ]
        if min_year and max_year:
            lines.append(f"- 연도 범위: {min_year}–{max_year}")
        elif min_year:
            lines.append(f"- 최초 등장: {min_year}년")
        elif max_year:
            lines.append(f"- 최근 연도: {max_year}년")

        if emerging:
            lines.append(f"- 신흥 개념 (최근 2년): {', '.join(emerging[:10])}")
        lines.append("")

    # ---- Footer ----
    lines += [
        "---",
        "",
        f"*ScholaRAG Graph 자동 생성 보고서 — {today}*",
    ]

    return "\n".join(lines)


def generate_html_report(summary: dict, project_name: str) -> str:
    """
    Wrap the Markdown report in a minimal HTML template with inline CSS.

    Returns:
        HTML string.
    """
    md_content = generate_markdown_report(summary, project_name)

    # Simple Markdown → HTML conversion for common patterns
    # (Avoids a full markdown parser dependency)
    html_body = _simple_md_to_html(md_content)

    return f"""<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>연구 지형 리포트: {project_name}</title>
<style>
  body {{
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    max-width: 900px;
    margin: 40px auto;
    padding: 0 24px;
    color: #1a1a1a;
    line-height: 1.7;
    background: #fafafa;
  }}
  h1 {{ color: #0f172a; border-bottom: 3px solid #2563eb; padding-bottom: 8px; }}
  h2 {{ color: #1e3a5f; border-bottom: 1px solid #e2e8f0; padding-bottom: 4px; margin-top: 2em; }}
  h3 {{ color: #374151; margin-top: 1.5em; }}
  table {{ border-collapse: collapse; width: 100%; margin: 1em 0; }}
  th {{ background: #2563eb; color: white; padding: 8px 12px; text-align: left; }}
  td {{ padding: 7px 12px; border-bottom: 1px solid #e2e8f0; }}
  tr:nth-child(even) td {{ background: #f1f5f9; }}
  code {{ background: #f1f5f9; padding: 2px 5px; border-radius: 3px; font-size: 0.9em; }}
  li {{ margin: 4px 0; }}
  hr {{ border: none; border-top: 1px solid #e2e8f0; margin: 2em 0; }}
  strong {{ color: #1e3a5f; }}
  .footer {{ color: #64748b; font-size: 0.85em; font-style: italic; }}
</style>
</head>
<body>
{html_body}
</body>
</html>"""


def _simple_md_to_html(md: str) -> str:
    """
    Minimal Markdown → HTML conversion covering the patterns used in the report.
    Handles: headings, bold, tables, lists, hr, paragraphs.
    """
    import re

    lines = md.split("\n")
    html_lines: list[str] = []
    in_table = False
    in_list = False

    def inline(text: str) -> str:
        # Bold: **text**
        text = re.sub(r"\*\*(.+?)\*\*", r"<strong>\1</strong>", text)
        # Italic: *text*
        text = re.sub(r"\*(.+?)\*", r"<em>\1</em>", text)
        # Inline code: `text`
        text = re.sub(r"`(.+?)`", r"<code>\1</code>", text)
        return text

    for line in lines:
        stripped = line.strip()

        # Headings
        if stripped.startswith("### "):
            if in_list:
                html_lines.append("</ul>")
                in_list = False
            if in_table:
                html_lines.append("</table>")
                in_table = False
            html_lines.append(f"<h3>{inline(stripped[4:])}</h3>")
            continue
        if stripped.startswith("## "):
            if in_list:
                html_lines.append("</ul>")
                in_list = False
            if in_table:
                html_lines.append("</table>")
                in_table = False
            html_lines.append(f"<h2>{inline(stripped[3:])}</h2>")
            continue
        if stripped.startswith("# "):
            if in_list:
                html_lines.append("</ul>")
                in_list = False
            html_lines.append(f"<h1>{inline(stripped[2:])}</h1>")
            continue

        # Horizontal rule
        if stripped == "---":
            if in_list:
                html_lines.append("</ul>")
                in_list = False
            if in_table:
                html_lines.append("</table>")
                in_table = False
            html_lines.append("<hr>")
            continue

        # Table rows (start with |)
        if stripped.startswith("|"):
            cells = [c.strip() for c in stripped.split("|")[1:-1]]
            # Skip separator rows like |---|---|
            if all(re.match(r"^-+$", c) for c in cells if c):
                continue
            if not in_table:
                html_lines.append("<table>")
                in_table = True
                # First row becomes header
                html_lines.append(
                    "<tr>" + "".join(f"<th>{inline(c)}</th>" for c in cells) + "</tr>"
                )
            else:
                html_lines.append(
                    "<tr>" + "".join(f"<td>{inline(c)}</td>" for c in cells) + "</tr>"
                )
            continue

        # Close table if we leave table context
        if in_table and not stripped.startswith("|"):
            html_lines.append("</table>")
            in_table = False

        # List items
        if stripped.startswith("- ") or stripped.startswith("  - "):
            if not in_list:
                html_lines.append("<ul>")
                in_list = True
            html_lines.append(f"<li>{inline(stripped.lstrip('- '))}</li>")
            continue

        # Numbered list items
        m = re.match(r"^(\d+)\.\s+(.+)$", stripped)
        if m:
            if not in_list:
                html_lines.append("<ol>")
                in_list = True
            html_lines.append(f"<li>{inline(m.group(2))}</li>")
            continue

        # Close list on blank or non-list line
        if in_list and stripped == "":
            html_lines.append("</ul>")
            in_list = False

        # Empty line → paragraph break
        if stripped == "":
            html_lines.append("")
            continue

        # Plain paragraph
        html_lines.append(f"<p>{inline(stripped)}</p>")

    if in_list:
        html_lines.append("</ul>")
    if in_table:
        html_lines.append("</table>")

    return "\n".join(html_lines)
