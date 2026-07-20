from __future__ import annotations

from datetime import date
from pathlib import Path

from docx import Document
from docx.enum.section import WD_SECTION
from docx.enum.table import WD_CELL_VERTICAL_ALIGNMENT, WD_TABLE_ALIGNMENT
from docx.enum.text import WD_ALIGN_PARAGRAPH, WD_BREAK, WD_LINE_SPACING
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from docx.shared import Inches, Pt, RGBColor


ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "docs" / "XJD_Finance_系统使用操作说明书.docx"

NAVY = "17264A"
BLUE = "2F6FED"
TEAL = "20A67A"
ORANGE = "F08A24"
INK = "13213C"
MUTED = "67758D"
LIGHT_BLUE = "E8EEF5"
LIGHTER_BLUE = "F4F7FB"
LIGHT_GREEN = "EAF7F2"
LIGHT_ORANGE = "FFF4E6"
WHITE = "FFFFFF"
GRID = "C8D2E1"
RED = "B42318"

LATIN_FONT = "Calibri"
CJK_FONT = "Microsoft YaHei"


def set_cell_shading(cell, fill: str):
    tc_pr = cell._tc.get_or_add_tcPr()
    shd = tc_pr.find(qn("w:shd"))
    if shd is None:
        shd = OxmlElement("w:shd")
        tc_pr.append(shd)
    shd.set(qn("w:fill"), fill)


def set_cell_margins(cell, top=80, start=120, bottom=80, end=120):
    tc = cell._tc
    tc_pr = tc.get_or_add_tcPr()
    tc_mar = tc_pr.first_child_found_in("w:tcMar")
    if tc_mar is None:
        tc_mar = OxmlElement("w:tcMar")
        tc_pr.append(tc_mar)
    for margin, value in (("top", top), ("start", start), ("bottom", bottom), ("end", end)):
        node = tc_mar.find(qn(f"w:{margin}"))
        if node is None:
            node = OxmlElement(f"w:{margin}")
            tc_mar.append(node)
        node.set(qn("w:w"), str(value))
        node.set(qn("w:type"), "dxa")


def set_cell_width(cell, width_dxa: int):
    tc_pr = cell._tc.get_or_add_tcPr()
    tc_w = tc_pr.find(qn("w:tcW"))
    if tc_w is None:
        tc_w = OxmlElement("w:tcW")
        tc_pr.append(tc_w)
    tc_w.set(qn("w:w"), str(width_dxa))
    tc_w.set(qn("w:type"), "dxa")


def set_table_geometry(table, widths_dxa: list[int], indent_dxa: int = 120):
    table.autofit = False
    table.alignment = WD_TABLE_ALIGNMENT.LEFT
    tbl_pr = table._tbl.tblPr

    tbl_w = tbl_pr.find(qn("w:tblW"))
    if tbl_w is None:
        tbl_w = OxmlElement("w:tblW")
        tbl_pr.append(tbl_w)
    tbl_w.set(qn("w:w"), str(sum(widths_dxa)))
    tbl_w.set(qn("w:type"), "dxa")

    tbl_ind = tbl_pr.find(qn("w:tblInd"))
    if tbl_ind is None:
        tbl_ind = OxmlElement("w:tblInd")
        tbl_pr.append(tbl_ind)
    tbl_ind.set(qn("w:w"), str(indent_dxa))
    tbl_ind.set(qn("w:type"), "dxa")

    grid = table._tbl.tblGrid
    for child in list(grid):
        grid.remove(child)
    for width in widths_dxa:
        col = OxmlElement("w:gridCol")
        col.set(qn("w:w"), str(width))
        grid.append(col)

    for row in table.rows:
        cant_split = OxmlElement("w:cantSplit")
        row._tr.get_or_add_trPr().append(cant_split)
        for index, cell in enumerate(row.cells):
            set_cell_width(cell, widths_dxa[index])
            set_cell_margins(cell)
            cell.vertical_alignment = WD_CELL_VERTICAL_ALIGNMENT.CENTER


def set_repeat_table_header(row):
    tr_pr = row._tr.get_or_add_trPr()
    tbl_header = OxmlElement("w:tblHeader")
    tbl_header.set(qn("w:val"), "true")
    tr_pr.append(tbl_header)


def set_run_font(run, size=None, color=None, bold=None, italic=None, name=LATIN_FONT):
    run.font.name = name
    run._element.get_or_add_rPr().rFonts.set(qn("w:ascii"), name)
    run._element.get_or_add_rPr().rFonts.set(qn("w:hAnsi"), name)
    run._element.get_or_add_rPr().rFonts.set(qn("w:eastAsia"), CJK_FONT)
    if size is not None:
        run.font.size = Pt(size)
    if color is not None:
        run.font.color.rgb = RGBColor.from_string(color)
    if bold is not None:
        run.bold = bold
    if italic is not None:
        run.italic = italic


def style_paragraph(paragraph, before=0, after=6, line=1.25, keep_with_next=False):
    fmt = paragraph.paragraph_format
    fmt.space_before = Pt(before)
    fmt.space_after = Pt(after)
    fmt.line_spacing = line
    fmt.keep_with_next = keep_with_next


def add_text(doc, text: str, *, bold=False, color=INK, size=11, after=6, align=None):
    p = doc.add_paragraph()
    style_paragraph(p, after=after)
    if align is not None:
        p.alignment = align
    run = p.add_run(text)
    set_run_font(run, size=size, color=color, bold=bold)
    return p


def add_list(doc, items: list[str], numbered=False):
    style_name = "List Number" if numbered else "List Bullet"
    for item in items:
        p = doc.add_paragraph(style=style_name)
        style_paragraph(p, after=4, line=1.25)
        p.paragraph_format.left_indent = Inches(0.375)
        p.paragraph_format.first_line_indent = Inches(-0.188)
        run = p.add_run(item)
        set_run_font(run, size=11, color=INK)


def add_callout(doc, title: str, body: str, fill=LIGHT_BLUE, accent=BLUE):
    table = doc.add_table(rows=1, cols=1)
    set_table_geometry(table, [9360])
    cell = table.cell(0, 0)
    set_cell_shading(cell, fill)
    tc_pr = cell._tc.get_or_add_tcPr()
    borders = tc_pr.find(qn("w:tcBorders"))
    if borders is None:
        borders = OxmlElement("w:tcBorders")
        tc_pr.append(borders)
    start = OxmlElement("w:start")
    start.set(qn("w:val"), "single")
    start.set(qn("w:sz"), "20")
    start.set(qn("w:color"), accent)
    borders.append(start)
    p = cell.paragraphs[0]
    style_paragraph(p, after=3)
    r = p.add_run(title)
    set_run_font(r, size=11, color=accent, bold=True)
    p2 = cell.add_paragraph()
    style_paragraph(p2, after=0)
    r2 = p2.add_run(body)
    set_run_font(r2, size=10.5, color=INK)
    add_text(doc, "", size=1, after=2)


def add_table(doc, headers: list[str], rows: list[list[str]], widths_dxa: list[int], header_fill=LIGHT_BLUE):
    table = doc.add_table(rows=1, cols=len(headers))
    table.style = "Table Grid"
    set_table_geometry(table, widths_dxa)
    set_repeat_table_header(table.rows[0])
    for index, header in enumerate(headers):
        cell = table.rows[0].cells[index]
        set_cell_shading(cell, header_fill)
        p = cell.paragraphs[0]
        p.alignment = WD_ALIGN_PARAGRAPH.CENTER
        style_paragraph(p, after=0, line=1.0)
        r = p.add_run(header)
        set_run_font(r, size=9.5, color=NAVY, bold=True)
    for row_index, values in enumerate(rows):
        cells = table.add_row().cells
        for col_index, value in enumerate(values):
            if row_index % 2 == 1:
                set_cell_shading(cells[col_index], "F9FBFD")
            p = cells[col_index].paragraphs[0]
            if headers[col_index] == "序":
                p.alignment = WD_ALIGN_PARAGRAPH.CENTER
            style_paragraph(p, after=0, line=1.1)
            r = p.add_run(str(value))
            set_run_font(r, size=9.2, color=INK)
    set_table_geometry(table, widths_dxa)
    add_text(doc, "", size=1, after=4)
    return table


def add_page_number(paragraph):
    run = paragraph.add_run()
    fld_char1 = OxmlElement("w:fldChar")
    fld_char1.set(qn("w:fldCharType"), "begin")
    instr_text = OxmlElement("w:instrText")
    instr_text.set(qn("xml:space"), "preserve")
    instr_text.text = "PAGE"
    fld_char2 = OxmlElement("w:fldChar")
    fld_char2.set(qn("w:fldCharType"), "end")
    run._r.append(fld_char1)
    run._r.append(instr_text)
    run._r.append(fld_char2)
    set_run_font(run, size=9, color=MUTED)


def add_heading(doc, text: str, level: int):
    p = doc.add_paragraph(style=f"Heading {level}")
    r = p.add_run(text)
    set_run_font(r, size={1: 16, 2: 13, 3: 12}[level], color={1: BLUE, 2: BLUE, 3: NAVY}[level], bold=True)
    p.paragraph_format.keep_with_next = True
    return p


def add_step(doc, number: int, title: str, body: str):
    p = doc.add_paragraph()
    style_paragraph(p, before=2, after=3, keep_with_next=True)
    r1 = p.add_run(f"步骤 {number}  {title}")
    set_run_font(r1, size=11.5, color=NAVY, bold=True)
    p2 = doc.add_paragraph()
    style_paragraph(p2, after=7)
    p2.paragraph_format.left_indent = Inches(0.18)
    r2 = p2.add_run(body)
    set_run_font(r2, size=10.5, color=INK)


def configure_document(doc: Document):
    section = doc.sections[0]
    section.page_width = Inches(8.5)
    section.page_height = Inches(11)
    section.top_margin = Inches(1)
    section.bottom_margin = Inches(1)
    section.left_margin = Inches(1)
    section.right_margin = Inches(1)
    section.header_distance = Inches(0.492)
    section.footer_distance = Inches(0.492)

    normal = doc.styles["Normal"]
    normal.font.name = LATIN_FONT
    normal._element.rPr.rFonts.set(qn("w:ascii"), LATIN_FONT)
    normal._element.rPr.rFonts.set(qn("w:hAnsi"), LATIN_FONT)
    normal._element.rPr.rFonts.set(qn("w:eastAsia"), CJK_FONT)
    normal.font.size = Pt(11)
    normal.font.color.rgb = RGBColor.from_string(INK)
    normal.paragraph_format.space_after = Pt(6)
    normal.paragraph_format.line_spacing = 1.25

    heading_tokens = {
        1: (16, BLUE, 18, 10),
        2: (13, BLUE, 14, 7),
        3: (12, NAVY, 10, 5),
    }
    for level, (size, color, before, after) in heading_tokens.items():
        style = doc.styles[f"Heading {level}"]
        style.font.name = LATIN_FONT
        style._element.rPr.rFonts.set(qn("w:ascii"), LATIN_FONT)
        style._element.rPr.rFonts.set(qn("w:hAnsi"), LATIN_FONT)
        style._element.rPr.rFonts.set(qn("w:eastAsia"), CJK_FONT)
        style.font.size = Pt(size)
        style.font.bold = True
        style.font.color.rgb = RGBColor.from_string(color)
        style.paragraph_format.space_before = Pt(before)
        style.paragraph_format.space_after = Pt(after)
        style.paragraph_format.keep_with_next = True

    for style_name in ("List Bullet", "List Number"):
        style = doc.styles[style_name]
        style.font.name = LATIN_FONT
        style._element.rPr.rFonts.set(qn("w:ascii"), LATIN_FONT)
        style._element.rPr.rFonts.set(qn("w:hAnsi"), LATIN_FONT)
        style._element.rPr.rFonts.set(qn("w:eastAsia"), CJK_FONT)
        style.font.size = Pt(11)
        style.paragraph_format.left_indent = Inches(0.375)
        style.paragraph_format.first_line_indent = Inches(-0.188)
        style.paragraph_format.space_after = Pt(4)
        style.paragraph_format.line_spacing = 1.25

    header = section.header
    p = header.paragraphs[0]
    p.alignment = WD_ALIGN_PARAGRAPH.LEFT
    style_paragraph(p, after=0)
    r = p.add_run("XJD Finance  |  跨境物流财务管理使用操作说明书")
    set_run_font(r, size=9, color=MUTED, bold=True)

    footer = section.footer
    table = footer.add_table(rows=1, cols=2, width=Inches(6.5))
    set_table_geometry(table, [7200, 2160], indent_dxa=0)
    table.rows[0].cells[0].paragraphs[0].alignment = WD_ALIGN_PARAGRAPH.LEFT
    table.rows[0].cells[1].paragraphs[0].alignment = WD_ALIGN_PARAGRAPH.RIGHT
    r1 = table.rows[0].cells[0].paragraphs[0].add_run("内部操作参考 | 数据以已导入原始 Excel 和数据库记录为准")
    set_run_font(r1, size=8.5, color=MUTED)
    p2 = table.rows[0].cells[1].paragraphs[0]
    r2 = p2.add_run("第 ")
    set_run_font(r2, size=9, color=MUTED)
    add_page_number(p2)
    r3 = p2.add_run(" 页")
    set_run_font(r3, size=9, color=MUTED)


def build_manual():
    doc = Document()
    configure_document(doc)

    # Compact reference guide: credentials and the complete monthly workflow in six short sections.
    add_text(doc, "XJD FINANCE", bold=True, color=BLUE, size=12, after=30, align=WD_ALIGN_PARAGRAPH.CENTER)
    add_text(doc, "系统精简使用说明书", bold=True, color=NAVY, size=30, after=8, align=WD_ALIGN_PARAGRAPH.CENTER)
    add_text(doc, "登录 · Excel 导入 · 提成绩效 · 电子签名 · 收付款 · 锁账", color=MUTED, size=13, after=20, align=WD_ALIGN_PARAGRAPH.CENTER)
    add_text(doc, f"版本 1.1  |  {date.today().isoformat()}", color=MUTED, size=10, after=26, align=WD_ALIGN_PARAGRAPH.CENTER)
    add_callout(doc, "正式入口", "https://jiayinz906-lang.github.io/cross-border-finance-mvp/#/dashboard\n本地前端：http://localhost:5173/   本地 API：http://localhost:4000/api", fill=LIGHTER_BLUE, accent=BLUE)

    add_heading(doc, "1. 初始账号与密码", 1)
    add_table(
        doc,
        ["用途", "账号", "初始密码", "主要权限"],
        [
            ["系统管理员", "admin", "admin123", "账号、规则、导入、确认、锁账"],
            ["财务", "finance", "finance123", "导入、风险、应收应付、报表"],
            ["主管", "supervisor", "supervisor123", "提成确认、签名确认、锁账"],
            ["老板/管理层", "boss", "boss123", "经营数据与报表只读"],
            ["销售/客服", "sales", "sales123", "查看个人业务及确认单"],
        ],
        [1800, 1700, 2100, 3760],
    )
    add_callout(doc, "账号安全", "以上是系统初始化账号，已在当前本地数据库验证可登录。线上账号如已修改密码，应使用修改后的密码。正式使用时请立即改密，不要多人共用管理员账号；本说明书仅限公司内部保存。", fill=LIGHT_ORANGE, accent=ORANGE)
    add_step(doc, 1, "登录", "打开正式入口，输入账号和密码。token 失效时重新登录。")
    add_step(doc, 2, "确认身份与月份", "左下角核对姓名/角色，页面顶部核对当前月份后再操作。")
    add_heading(doc, "2. 每月必做流程", 1)
    add_step(doc, 1, "选择月份", "在经营总览点击月份。历史月份独立保存，切换月份不会删除其他月份数据。")
    add_step(doc, 2, "导入 Excel", "点击“上传 Excel 导入”→查看预检→核对月份、票数、应收、应付、毛利和字段映射→确认写入。")
    add_step(doc, 3, "核对财务数据", "在经营总览、业务利润、客户利润和风险复查中核对汇总并追溯原始 Excel 行。")
    add_step(doc, 4, "确认提成和绩效", "主管确认物流提成、注册提成及操作员绩效；实际票数和人员归属均以 Excel 为准。")
    add_step(doc, 5, "完成电子签名", "批量生成销售/操作员薪资确认单，发送链接，员工签名后由主管确认。")
    add_step(doc, 6, "登记收付款", "在应收管理登记回款，在上游应付登记付款；错误记录只能作废并填写原因。")
    add_step(doc, 7, "备份并锁账", "导出月报和系统备份，在参数规则页填写原因后锁账。未完成事项只提醒，仍可锁账。")
    add_callout(doc, "锁账规则", "锁账后该月份不能覆盖导入、回滚批次或修改历史确认数据；如需调整，由主管先解锁并记录原因。", fill=LIGHT_GREEN, accent=TEAL)

    add_heading(doc, "3. Excel 导入要点", 1)
    add_list(doc, [
        "仅上传 .xlsx/.xls，默认不超过 25MB；预检阶段不会写数据库。",
        "保留金额正负号、人民币/美元汇率标注、赔付、供应商、用户、销售代表、客服代表和下单时间。",
        "有阻断项时按提示的 Excel 行和字段修正源文件后重新预检。",
        "同月份重导以最新有效批次统计，旧批次保留审计记录；锁账月份禁止覆盖导入。",
        "系统金额不一致时下钻费用明细，核对收付方向、金额、汇率、费用类型和重复行，禁止手改汇总。",
    ])
    add_table(
        doc,
        ["必须重点核对", "正确口径"],
        [
            ["应收/应付", "费用行按收付方向聚合，保留原始正负号"],
            ["汇率", "人民币=1；美元未标注时=6.85；其余按 Excel 标注"],
            ["赔付及其他费用", "按 Excel 原始费用行参与计算，不改写正负号"],
            ["人员和用户", "严格读取销售代表、客服代表和用户字段"],
        ],
        [2700, 6660],
    )
    add_heading(doc, "4. 页面怎么用", 1)
    add_table(
        doc,
        ["页面", "主要操作"],
        [
            ["经营总览", "看应收、应付、毛利、毛利率、票数、趋势、客户和供应商"],
            ["业务利润", "核对总业务、物流、注册/服务分类及业务类型明细"],
            ["物流提成", "下钻订单，核对/调整比例，确认销售提成"],
            ["注册提成", "按销售代表确认注册、证书、商标和店铺租赁提成"],
            ["操作员绩效", "按客服代表统计，空运白关固定 50 元/票，自动汇总绩效"],
            ["客户利润", "查看客户应收、应付、毛利和毛利率"],
            ["风险复查", "查看原始 Excel 行，填写复核结论和说明"],
            ["应收管理", "登记/作废回款，查看未收款和账龄"],
            ["上游应付", "登记/作废付款，查看供应商费用和账龄"],
            ["参数规则", "模板、规则、流程提醒、锁账、账号、日志和系统状态"],
        ],
        [2300, 7060],
    )
    add_callout(doc, "金额核对", "订单应收合计=经营总览总应收；物流订单应付合计=上游应付总应付；应收-应付=对应范围毛利；已收/已付+未收/未付=订单应收/应付。", fill=LIGHTER_BLUE, accent=BLUE)

    add_heading(doc, "5. 提成、绩效与电子签名", 1)
    add_list(doc, [
        "物流提成：点击销售代表票数下钻订单；主管可调整单票比例，系统自动重算金额。",
        "注册提成：主管确认金额归属对应销售代表，并合并进入销售薪资确认单。",
        "操作员绩效：人员取 Excel 客服代表；Excel 票数不人工增删，分类金额自动汇总。",
        "电子签名：生成确认单→查看快照→生成/发送外链→员工签名→主管确认。",
        "Excel、PDF、PNG 来自同一快照，应保持人员、版本、明细和金额一致。",
        "签名链接一次性使用；过期、已签或作废后必须重新生成。已主管确认单据只能作废重签，不能覆盖。",
    ])
    add_callout(doc, "钉钉发送", "已配置企业应用且账号维护了员工钉钉用户 ID 时可直接发送；否则复制完整外部链接手工发送。", fill=LIGHT_GREEN, accent=TEAL)
    add_heading(doc, "6. 收付款、风险与锁账", 1)
    add_heading(doc, "应收/应付", 2)
    add_list(doc, [
        "回款或付款需填写金额、日期、方式、参考号和备注，保存后汇总与账龄自动刷新。",
        "错误结算不能删除，只能作废并填写原因，保留操作日志。",
        "上游应付只统计物流类订单；注册、证书和店铺租赁等服务类应付单独管理。",
    ])
    add_heading(doc, "风险复查", 2)
    add_list(doc, [
        "筛选低毛利或异常高利润订单，打开原始数据查看 Excel 行号和费用明细。",
        "填写复核结论与处理说明后保存，复核人、时间和状态写入审计日志。",
    ])
    add_heading(doc, "锁账与备份", 2)
    add_list(doc, [
        "参数规则页的未完成事项是提醒，不阻止主管锁账。",
        "锁账前导出月报和系统备份；锁账/解锁都必须填写原因。",
        "参数规则和表头模板只由授权管理员修改；修改规则不应重算已确认历史快照。",
    ])
    doc.add_page_break()
    add_heading(doc, "常见问题", 2)
    add_table(
        doc,
        ["问题", "处理"],
        [
            ["网页打不开", "本地检查 5173/4000/54329；线上检查 GitHub Pages 和 Render"],
            ["登录失败", "确认账号未停用、密码未修改；由管理员重置密码"],
            ["导入失败", "查看预检阻断项、文件大小/类型及月份锁账状态"],
            ["金额不一致", "核对原始 Excel 费用行，不直接修改系统汇总"],
            ["下载 401/403", "重新登录并使用页面下载按钮，不直接打开 API 地址"],
            ["签名链接无效", "确认使用线上链接；重新生成一次性签名链接"],
        ],
        [2300, 7060],
    )
    add_callout(doc, "内部责任", "系统用于计算、追溯和流程留痕，不替代会计凭证、银行流水、合同、发票和主管审批。", fill=LIGHT_ORANGE, accent=ORANGE)

    doc.core_properties.title = "XJD Finance 系统精简使用说明书"
    doc.core_properties.subject = "跨境物流财务管理系统精简操作指南"
    doc.core_properties.author = "XJD Finance"
    doc.core_properties.keywords = "XJD Finance, 财务管理, Excel导入, 提成, 电子签名, 应收应付"
    doc.core_properties.comments = "根据当前系统功能与权限生成。"

    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    doc.save(OUTPUT)
    print(OUTPUT)


if __name__ == "__main__":
    build_manual()
