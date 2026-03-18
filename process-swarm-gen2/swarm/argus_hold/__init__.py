"""ARGUS-Hold Layer — governed command execution for Process Swarm.

Public API:
    ARGUSHoldConfig     — runtime configuration
    CommandEnvelope     — canonical command request
    CommandResult       — structured execution output
    CommandRegistry     — versioned command spec registry
    ARGUSHoldDispatcher — 8-stage governance pipeline
"""

from swarm.argus_hold.config import ARGUSHoldConfig
from swarm.argus_hold.dispatcher import ARGUSHoldDispatcher
from swarm.argus_hold.models import CommandEnvelope, CommandResult
from swarm.argus_hold.registry import CommandRegistry

__all__ = [
    "ARGUSHoldConfig",
    "CommandEnvelope",
    "CommandResult",
    "CommandRegistry",
    "ARGUSHoldDispatcher",
]
