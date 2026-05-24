from pathlib import Path

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_LEFT
from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import inch
from reportlab.platypus import (
    PageBreak,
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)


ROOT = Path(__file__).resolve().parents[1]
OUT_DIR = ROOT / "docs" / "guides"
OUT_DIR.mkdir(parents=True, exist_ok=True)
PDF_PATH = OUT_DIR / "ornigami-review-booster-user-guide.pdf"


INK = colors.HexColor("#0F172B")
SLATE = colors.HexColor("#475569")
MUTED = colors.HexColor("#64748B")
CREAM = colors.HexColor("#FFF8EE")
ORANGE = colors.HexColor("#F97316")
ORANGE_SOFT = colors.HexColor("#FFF1E8")
GREEN = colors.HexColor("#15803D")
GREEN_SOFT = colors.HexColor("#ECFDF3")
LINE = colors.HexColor("#E2E8F0")


styles = getSampleStyleSheet()
styles.add(
    ParagraphStyle(
        name="GuideTitle",
        parent=styles["Title"],
        fontName="Helvetica-Bold",
        fontSize=28,
        leading=32,
        textColor=INK,
        alignment=TA_CENTER,
        spaceAfter=10,
    )
)
styles.add(
    ParagraphStyle(
        name="GuideSubtitle",
        parent=styles["BodyText"],
        fontName="Helvetica",
        fontSize=12,
        leading=18,
        textColor=SLATE,
        alignment=TA_CENTER,
        spaceAfter=16,
    )
)
styles.add(
    ParagraphStyle(
        name="SectionTitle",
        parent=styles["Heading1"],
        fontName="Helvetica-Bold",
        fontSize=18,
        leading=22,
        textColor=INK,
        spaceBefore=10,
        spaceAfter=8,
    )
)
styles.add(
    ParagraphStyle(
        name="CardTitle",
        parent=styles["Heading2"],
        fontName="Helvetica-Bold",
        fontSize=12,
        leading=16,
        textColor=INK,
        spaceAfter=4,
    )
)
styles.add(
    ParagraphStyle(
        name="Body",
        parent=styles["BodyText"],
        fontName="Helvetica",
        fontSize=10.5,
        leading=16,
        textColor=SLATE,
        alignment=TA_LEFT,
        spaceAfter=6,
    )
)
styles.add(
    ParagraphStyle(
        name="BulletBody",
        parent=styles["BodyText"],
        fontName="Helvetica",
        fontSize=10.5,
        leading=15,
        textColor=SLATE,
        leftIndent=12,
        bulletIndent=0,
        spaceAfter=4,
    )
)
styles.add(
    ParagraphStyle(
        name="MiniLabel",
        parent=styles["BodyText"],
        fontName="Helvetica-Bold",
        fontSize=8,
        leading=10,
        textColor=ORANGE,
        alignment=TA_CENTER,
        spaceAfter=4,
    )
)


def p(text, style="Body"):
    return Paragraph(text, styles[style])


def bullet(text):
    return Paragraph(text, styles["BulletBody"], bulletText="-")


def card(title, body, bg=colors.white, border=LINE):
    table = Table(
        [[p(title, "CardTitle")], [p(body)]],
        colWidths=[3.15 * inch],
    )
    table.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, -1), bg),
                ("BOX", (0, 0), (-1, -1), 1, border),
                ("LEFTPADDING", (0, 0), (-1, -1), 12),
                ("RIGHTPADDING", (0, 0), (-1, -1), 12),
                ("TOPPADDING", (0, 0), (-1, -1), 10),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 10),
            ]
        )
    )
    return table


def info_band(title, body, bg=ORANGE_SOFT, border=ORANGE):
    table = Table([[p(title, "CardTitle")], [p(body)]], colWidths=[6.7 * inch])
    table.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, -1), bg),
                ("BOX", (0, 0), (-1, -1), 1.2, border),
                ("LEFTPADDING", (0, 0), (-1, -1), 14),
                ("RIGHTPADDING", (0, 0), (-1, -1), 14),
                ("TOPPADDING", (0, 0), (-1, -1), 12),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 12),
            ]
        )
    )
    return table


def step_table(step_number, title, text):
    left = Table(
        [[p(f"STEP {step_number}", "MiniLabel")], [p(f"{step_number}", "GuideTitle")]],
        colWidths=[0.95 * inch],
        rowHeights=[0.3 * inch, 0.7 * inch],
    )
    left.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, -1), INK),
                ("TEXTCOLOR", (0, 0), (-1, -1), colors.white),
                ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                ("ALIGN", (0, 0), (-1, -1), "CENTER"),
                ("BOX", (0, 0), (-1, -1), 1, INK),
            ]
        )
    )
    right = Table([[p(title, "CardTitle")], [p(text)]], colWidths=[5.45 * inch])
    right.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, -1), colors.white),
                ("BOX", (0, 0), (-1, -1), 1, LINE),
                ("LEFTPADDING", (0, 0), (-1, -1), 12),
                ("RIGHTPADDING", (0, 0), (-1, -1), 12),
                ("TOPPADDING", (0, 0), (-1, -1), 10),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 10),
            ]
        )
    )
    wrap = Table([[left, right]], colWidths=[1.0 * inch, 5.55 * inch])
    wrap.setStyle(TableStyle([("VALIGN", (0, 0), (-1, -1), "TOP")]))
    return wrap


def draw_page(canvas, doc):
    canvas.saveState()
    width, height = letter
    canvas.setFillColor(CREAM)
    canvas.rect(0, 0, width, height, fill=1, stroke=0)
    canvas.setFillColor(colors.white)
    canvas.rect(0.45 * inch, 0.5 * inch, width - 0.9 * inch, height - 1.0 * inch, fill=1, stroke=0)
    canvas.setStrokeColor(LINE)
    canvas.setLineWidth(1)
    canvas.line(0.8 * inch, height - 0.75 * inch, width - 0.8 * inch, height - 0.75 * inch)
    canvas.setFont("Helvetica-Bold", 9)
    canvas.setFillColor(ORANGE)
    canvas.drawString(0.82 * inch, height - 0.63 * inch, "ORNIGAMI USER GUIDE")
    canvas.setFont("Helvetica", 8.5)
    canvas.setFillColor(MUTED)
    canvas.drawRightString(width - 0.82 * inch, 0.72 * inch, f"Page {doc.page}")
    canvas.restoreState()


story = []

story.append(Spacer(1, 0.6 * inch))
story.append(p("Ornigami Quick Start Guide", "GuideTitle"))
story.append(
    p(
        "A simple guide for new users, with special focus on Review Booster so teams can launch fast and start collecting more Google reviews.",
        "GuideSubtitle",
    )
)
story.append(Spacer(1, 0.15 * inch))

hero = Table(
    [
        [
            p("WHAT ORNIGAMI DOES", "CardTitle"),
            p("WHY REVIEW BOOSTER MATTERS", "CardTitle"),
        ],
        [
            p(
                "Ornigami helps local businesses manage customer-review workflows with AI. The two most important agents today are Review Booster and Review Replies."
            ),
            p(
                "Review Booster helps turn real completed visits into review opportunities. It is the easiest feature to explain, sell, and launch quickly."
            ),
        ],
    ],
    colWidths=[3.25 * inch, 3.25 * inch],
)
hero.setStyle(
    TableStyle(
        [
            ("BACKGROUND", (0, 0), (-1, 0), INK),
            ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
            ("BACKGROUND", (0, 1), (0, 1), ORANGE_SOFT),
            ("BACKGROUND", (1, 1), (1, 1), GREEN_SOFT),
            ("BOX", (0, 0), (-1, -1), 1, LINE),
            ("INNERGRID", (0, 0), (-1, -1), 1, LINE),
            ("LEFTPADDING", (0, 0), (-1, -1), 12),
            ("RIGHTPADDING", (0, 0), (-1, -1), 12),
            ("TOPPADDING", (0, 0), (-1, -1), 10),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 10),
            ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ]
    )
)
story.append(hero)
story.append(Spacer(1, 0.22 * inch))
story.append(
    info_band(
        "The simple explanation",
        "You finish a customer visit, add that visit into Ornigami, and Review Booster sends a friendly follow-up email asking for a Google review.",
    )
)

story.append(PageBreak())
story.append(p("Start Here", "SectionTitle"))
story.append(
    p(
        "If you are onboarding a new customer, this is the fastest path to getting value from Review Booster."
    )
)
story.append(Spacer(1, 0.05 * inch))

for step in [
    (
        "1",
        "Activate Review Booster",
        "Open Billing & subscriptions and activate the Review Booster agent for the business.",
    ),
    (
        "2",
        "Save Review Booster settings",
        "Open Review Booster Settings and complete business name, business type, tone, language, and Google review URL.",
    ),
    (
        "3",
        "Connect Google Business Profile if available",
        "This is optional, but recommended. Ornigami can usually pull the review link automatically from synced Google locations.",
    ),
    (
        "4",
        "Add completed visits",
        "Start with manual visit entry or upload a CSV if the business already tracks visits elsewhere.",
    ),
    (
        "5",
        "Run follow-ups",
        "Use Run follow-ups now to send the first batch and confirm the workflow is working.",
    ),
]:
    story.append(step_table(*step))
    story.append(Spacer(1, 0.12 * inch))

story.append(
    info_band(
        "What you need before you begin",
        "An Ornigami account, an active Review Booster subscription, a Google review link, and a simple process for recording completed visits.",
        bg=GREEN_SOFT,
        border=GREEN,
    )
)

story.append(PageBreak())
story.append(p("Two Easy Ways To Use Review Booster", "SectionTitle"))

two_up = Table(
    [
        [
            card(
                "Option A: Manual daily workflow",
                "Best for small teams and lower visit volume. Add visits during the day, review the dashboard, click Run follow-ups now, and check which visits are marked sent, pending, or failed.",
                bg=colors.white,
            ),
            card(
                "Option B: CSV upload workflow",
                "Best for clinics, salons, gyms, and other teams with more daily volume. Export visits from your current system, match the Ornigami template, upload, review results, and run follow-ups.",
                bg=colors.white,
            ),
        ]
    ],
    colWidths=[3.3 * inch, 3.3 * inch],
)
two_up.setStyle(TableStyle([("VALIGN", (0, 0), (-1, -1), "TOP")]))
story.append(two_up)
story.append(Spacer(1, 0.22 * inch))
story.append(p("CSV template fields", "SectionTitle"))

csv_table = Table(
    [
        [p("Field", "CardTitle"), p("What it means", "CardTitle")],
        [p("customer_name"), p("Customer name")],
        [p("customer_email"), p("Customer email address")],
        [p("service_received or service_name"), p("What the customer came in for")],
        [p("visited_at"), p("The visit date")],
    ],
    colWidths=[2.2 * inch, 4.4 * inch],
)
csv_table.setStyle(
    TableStyle(
        [
            ("BACKGROUND", (0, 0), (-1, 0), INK),
            ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
            ("BACKGROUND", (0, 1), (-1, -1), colors.white),
            ("BOX", (0, 0), (-1, -1), 1, LINE),
            ("INNERGRID", (0, 0), (-1, -1), 1, LINE),
            ("LEFTPADDING", (0, 0), (-1, -1), 10),
            ("RIGHTPADDING", (0, 0), (-1, -1), 10),
            ("TOPPADDING", (0, 0), (-1, -1), 8),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
        ]
    )
)
story.append(csv_table)

story.append(PageBreak())
story.append(p("What The Dashboard Is Telling You", "SectionTitle"))
story.append(bullet("Pending means the visit is waiting to be processed."))
story.append(bullet("Sent means the follow-up email was sent successfully."))
story.append(bullet("Failed means the send did not complete and should be checked."))
story.append(bullet("Skipped usually means the row was duplicate or already handled."))
story.append(Spacer(1, 0.16 * inch))
story.append(
    info_band(
        "Simple weekly habit",
        "A good first-week goal is to activate Review Booster, save settings, add 10 to 20 real visits, run the first batch, and confirm that messages are sending correctly.",
        bg=ORANGE_SOFT,
        border=ORANGE,
    )
)
story.append(Spacer(1, 0.18 * inch))
story.append(p("Best practices for better results", "SectionTitle"))
best_practices = Table(
    [
        [
            card("Use a real review link", "Always test the Google review link before sending a live campaign.", bg=ORANGE_SOFT),
            card("Keep the tone human", "Warm and friendly usually works best for local businesses.", bg=GREEN_SOFT, border=GREEN),
        ],
        [
            card("Upload only real completed visits", "Review Booster should be tied to real customer experiences, not cold outreach.", bg=colors.white),
            card("Check failed sends regularly", "A quick review of failed items helps you catch setup issues early.", bg=colors.white),
        ],
    ],
    colWidths=[3.3 * inch, 3.3 * inch],
)
best_practices.setStyle(TableStyle([("VALIGN", (0, 0), (-1, -1), "TOP")]))
story.append(best_practices)

story.append(PageBreak())
story.append(p("How Review Replies Fits In", "SectionTitle"))
story.append(
    p(
        "Review Booster helps the business earn more reviews. Review Replies helps the business answer those reviews faster. Together they create a simple, easy-to-understand reputation loop."
    )
)

loop_table = Table(
    [
        [p("1. Get more reviews", "CardTitle"), p("2. Reply faster", "CardTitle"), p("3. Look more active on Google", "CardTitle")],
        [
            p("Review Booster sends a friendly follow-up after completed visits."),
            p("Review Replies drafts or posts helpful responses."),
            p("The business looks responsive, trusted, and current."),
        ],
    ],
    colWidths=[2.1 * inch, 2.1 * inch, 2.3 * inch],
)
loop_table.setStyle(
    TableStyle(
        [
            ("BACKGROUND", (0, 0), (-1, 0), INK),
            ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
            ("BACKGROUND", (0, 1), (0, 1), ORANGE_SOFT),
            ("BACKGROUND", (1, 1), (1, 1), colors.white),
            ("BACKGROUND", (2, 1), (2, 1), GREEN_SOFT),
            ("BOX", (0, 0), (-1, -1), 1, LINE),
            ("INNERGRID", (0, 0), (-1, -1), 1, LINE),
            ("LEFTPADDING", (0, 0), (-1, -1), 10),
            ("RIGHTPADDING", (0, 0), (-1, -1), 10),
            ("TOPPADDING", (0, 0), (-1, -1), 10),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 10),
            ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ]
    )
)
story.append(loop_table)
story.append(Spacer(1, 0.2 * inch))
story.append(p("Quick FAQ", "SectionTitle"))
story.append(bullet("Do I need Google Business Profile connected? No. You can still use Review Booster with a manual review link."))
story.append(bullet("Can I start small? Yes. Manual visit entry works well for smaller teams."))
story.append(bullet("What if I already have another system? Use the CSV upload workflow."))
story.append(bullet("What if a send fails? Check settings, your sending setup, and your review link, then run again after fixing the issue."))
story.append(Spacer(1, 0.22 * inch))
story.append(
    info_band(
        "Send-ready summary",
        "If you are introducing Ornigami to a new customer, lead with Review Booster first. It is simple to explain, easy to demo, and directly tied to more Google reviews.",
        bg=GREEN_SOFT,
        border=GREEN,
    )
)


doc = SimpleDocTemplate(
    str(PDF_PATH),
    pagesize=letter,
    leftMargin=0.8 * inch,
    rightMargin=0.8 * inch,
    topMargin=0.95 * inch,
    bottomMargin=0.95 * inch,
)

doc.build(story, onFirstPage=draw_page, onLaterPages=draw_page)
print(PDF_PATH)
