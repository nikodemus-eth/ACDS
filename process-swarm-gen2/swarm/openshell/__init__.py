"""OpenShell Layer — governed command execution for Process Swarm.

Public API:
    OpenShellConfig     — runtime configuration
    CommandEnvelope     — canonical command request
    CommandResult       — structured execution output
    CommandRegistry     — versioned command spec registry
    OpenShellDispatcher — 8-stage governance pipeline
"""

from swarm.openshell.config import OpenShellConfig
from swarm.openshell.dispatcher import OpenShellDispatcher
from swarm.openshell.models import CommandEnvelope, CommandResult
from swarm.openshell.registry import CommandRegistry

__all__ = [
    "OpenShellConfig",
    "CommandEnvelope",
    "CommandResult",
    "CommandRegistry",
    "OpenShellDispatcher",
]
