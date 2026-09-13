from __future__ import annotations

import hashlib
from io import BytesIO

import pytest
from pypdf import PdfWriter
from pypdf.generic import DecodedStreamObject, DictionaryObject, NameObject

from app.documents.ingestion import PDFIngestionService, PDFValidationError


def make_pdf(*texts: str, encrypted: bool = False) -> bytes:
    writer = PdfWriter()
    font = writer._add_object(
        DictionaryObject(
            {
                NameObject("/Type"): NameObject("/Font"),
                NameObject("/Subtype"): NameObject("/Type1"),
                NameObject("/BaseFont"): NameObject("/Helvetica"),
            }
        )
    )
    for text in texts:
        page = writer.add_blank_page(width=612, height=792)
        page[NameObject("/Resources")] = DictionaryObject(
            {NameObject("/Font"): DictionaryObject({NameObject("/F1"): font})}
        )
        stream = DecodedStreamObject()
        escaped = text.replace("\\", "\\\\").replace("(", "\\(").replace(")", "\\)")
        stream.set_data(f"BT /F1 12 Tf 72 720 Td ({escaped}) Tj ET".encode())
        page[NameObject("/Contents")] = writer._add_object(stream)
    if encrypted:
        writer.encrypt("secret")
    output = BytesIO()
    writer.write(output)
    return output.getvalue()


def test_extracts_pages_and_stable_sha256() -> None:
    data = make_pdf("Factory limit is 220 units.", "Reset sequence starts at step 4.")

    result = PDFIngestionService().ingest(BytesIO(data), filename="manuals/guide.pdf")

    assert result.filename == "guide.pdf"
    assert result.sha256 == hashlib.sha256(data).hexdigest()
    assert result.size_bytes == len(data)
    assert result.page_count == 2
    assert [page.page_number for page in result.pages] == [1, 2]
    assert "220 units" in result.pages[0].text
    assert "step 4" in result.pages[1].text


def test_rejects_invalid_signature() -> None:
    with pytest.raises(PDFValidationError, match="not a PDF"):
        PDFIngestionService().ingest(b"not a pdf")


def test_rejects_oversized_input() -> None:
    with pytest.raises(PDFValidationError, match="maximum size"):
        PDFIngestionService(max_upload_bytes=5).ingest(b"%PDF-123456")


def test_rejects_page_count_over_limit() -> None:
    data = make_pdf("one", "two")

    with pytest.raises(PDFValidationError, match="maximum page count"):
        PDFIngestionService(max_pdf_pages=1).ingest(data)


def test_rejects_encrypted_pdf() -> None:
    with pytest.raises(PDFValidationError, match="Encrypted"):
        PDFIngestionService().ingest(make_pdf("secret", encrypted=True))


def test_rejects_pdf_without_usable_text() -> None:
    with pytest.raises(PDFValidationError, match="usable extracted text"):
        PDFIngestionService().ingest(make_pdf(""))
