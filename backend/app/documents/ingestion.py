"""Validated, page-preserving PDF extraction for the local document pipeline."""

from __future__ import annotations

import hashlib
import re
from dataclasses import dataclass
from io import BytesIO
from pathlib import Path
from typing import BinaryIO

from pypdf import PdfReader


DEFAULT_MAX_UPLOAD_BYTES = 25 * 1024 * 1024
DEFAULT_MAX_PDF_PAGES = 300


class PDFValidationError(ValueError):
    """Raised when an uploaded PDF violates an ingestion constraint."""


@dataclass(frozen=True)
class ExtractedPage:
    """Text extracted from one physical PDF page."""

    page_number: int
    text: str


@dataclass(frozen=True)
class ExtractedDocument:
    """Validated PDF metadata and page-level text."""

    filename: str
    sha256: str
    size_bytes: int
    page_count: int
    pages: tuple[ExtractedPage, ...]


class PDFIngestionService:
    """Validate and extract selectable-text PDFs without crossing page boundaries."""

    def __init__(
        self,
        *,
        max_upload_bytes: int = DEFAULT_MAX_UPLOAD_BYTES,
        max_pdf_pages: int = DEFAULT_MAX_PDF_PAGES,
    ) -> None:
        if max_upload_bytes <= 0 or max_pdf_pages <= 0:
            raise ValueError("PDF limits must be positive")
        self.max_upload_bytes = max_upload_bytes
        self.max_pdf_pages = max_pdf_pages

    def ingest(
        self,
        source: bytes | bytearray | BinaryIO,
        *,
        filename: str = "document.pdf",
    ) -> ExtractedDocument:
        """Read, validate, hash, and extract one PDF."""

        data = self._read_bytes(source)
        if len(data) > self.max_upload_bytes:
            raise PDFValidationError(
                f"PDF exceeds maximum size of {self.max_upload_bytes} bytes"
            )
        if not data.startswith(b"%PDF-"):
            raise PDFValidationError("Uploaded file is not a PDF")

        try:
            reader = PdfReader(BytesIO(data), strict=False)
        except Exception as exc:
            raise PDFValidationError(f"PDF could not be parsed: {exc}") from exc

        if reader.is_encrypted:
            raise PDFValidationError("Encrypted PDFs are not supported")

        page_count = len(reader.pages)
        if page_count > self.max_pdf_pages:
            raise PDFValidationError(
                f"PDF exceeds maximum page count of {self.max_pdf_pages}"
            )

        pages: list[ExtractedPage] = []
        for page_number, page in enumerate(reader.pages, start=1):
            try:
                text = _normalize_page_text(page.extract_text() or "")
            except Exception as exc:
                raise PDFValidationError(
                    f"Could not extract text from page {page_number}: {exc}"
                ) from exc
            if text:
                pages.append(ExtractedPage(page_number=page_number, text=text))

        if not pages:
            raise PDFValidationError("PDF contains no usable extracted text")

        return ExtractedDocument(
            filename=Path(filename).name or "document.pdf",
            sha256=hashlib.sha256(data).hexdigest(),
            size_bytes=len(data),
            page_count=page_count,
            pages=tuple(pages),
        )

    @staticmethod
    def _read_bytes(source: bytes | bytearray | BinaryIO) -> bytes:
        if isinstance(source, (bytes, bytearray)):
            return bytes(source)
        try:
            data = source.read()
        except AttributeError as exc:
            raise TypeError("PDF source must be bytes or a binary file-like object") from exc
        if not isinstance(data, (bytes, bytearray)):
            raise TypeError("PDF source must return bytes")
        return bytes(data)


def _normalize_page_text(text: str) -> str:
    """Normalize layout whitespace while retaining paragraph breaks."""

    text = text.replace("\r\n", "\n").replace("\r", "\n")
    text = re.sub(r"[ \t]+", " ", text)
    text = re.sub(r" *\n *", "\n", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()
