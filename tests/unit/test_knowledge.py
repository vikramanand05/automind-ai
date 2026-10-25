import pytest
from automind.knowledge import chunk_text, extract, ingest, query, remove_document, safe_filename
from automind.schemas import KnowledgeQuery


def test_chunking_preserves_end_and_overlap():
    text = " ".join(f"word{i}" for i in range(90))
    chunks = chunk_text(text, 30, 5)
    assert chunks[0].split()[-5:] == chunks[1].split()[:5]
    assert chunks[-1].endswith("word89")
    assert len(chunks) == 4
    with pytest.raises(ValueError):
        chunk_text(text, 30, 30)


def test_filename_and_untrusted_data():
    assert safe_filename("../../secret\\manual.md") == "manual.md"
    with pytest.raises(ValueError):
        safe_filename("script.exe")
    with pytest.raises(ValueError):
        extract(b"\x00binary", "file.txt")
    assert extract(b"a,b\n1,2", "data.csv")[0][1] == "a | b\n1 | 2"


def test_retrieval_citations_idempotency_and_deletion(db):
    content = b"The synthetic conveyor inspection interval is every 14 days. Record belt alignment."
    first = ingest(db, content, "maintenance.txt")
    second = ingest(db, content, "other.txt")
    assert second["duplicate"] and first["id"] == second["id"]
    result = query(db, KnowledgeQuery(question="conveyor inspection interval"))
    assert result["sources"][0]["document_id"] == first["id"]
    assert "14 days" in result["answer"] and "[1]" in result["answer"]
    remove_document(db, first["id"])
    assert not query(db, KnowledgeQuery(question="conveyor inspection interval"))["sources"]


def test_insufficient_evidence_abstains(db):
    result = query(db, KnowledgeQuery(question="Unknown technical procedure"))
    assert not result["sufficient_evidence"]
    assert "sufficient evidence" in result["answer"]
