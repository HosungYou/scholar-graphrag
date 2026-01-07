"""
Chat API Router

Handles multi-agent chat interactions with graph-grounded responses.
"""

from typing import List, Optional
from uuid import UUID
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from datetime import datetime


router = APIRouter()


# Pydantic Models
class ChatMessage(BaseModel):
    role: str  # "user" or "assistant"
    content: str
    timestamp: datetime
    citations: Optional[List[str]] = None
    highlighted_nodes: Optional[List[str]] = None
    highlighted_edges: Optional[List[str]] = None


class ChatRequest(BaseModel):
    project_id: UUID
    message: str
    conversation_id: Optional[str] = None


class ChatResponse(BaseModel):
    conversation_id: str
    message: ChatMessage
    agent_trace: Optional[dict] = None  # Debug: show agent pipeline steps


class ConversationHistory(BaseModel):
    conversation_id: str
    project_id: UUID
    messages: List[ChatMessage]
    created_at: datetime
    updated_at: datetime


# In-memory storage
_conversations_db: dict = {}


@router.post("/query", response_model=ChatResponse)
async def chat_query(request: ChatRequest):
    """
    Send a query to the multi-agent system.

    Pipeline:
    1. Intent Agent - Classify user intent
    2. Concept Extraction Agent - Extract entities from query
    3. Task Planning Agent - Break down complex queries
    4. Query Execution Agent - Run SQL + Vector searches
    5. Reasoning Agent - Synthesize results
    6. Response Agent - Generate user-friendly response
    """
    from uuid import uuid4

    # Create or get conversation
    conversation_id = request.conversation_id or str(uuid4())

    # TODO: Implement actual multi-agent pipeline
    # For now, return a placeholder response

    user_message = ChatMessage(
        role="user",
        content=request.message,
        timestamp=datetime.now(),
    )

    assistant_message = ChatMessage(
        role="assistant",
        content=f"[Placeholder] Processing query: '{request.message}'\n\n"
        "The multi-agent system will analyze your query and provide "
        "graph-grounded responses with citations.",
        timestamp=datetime.now(),
        citations=[],
        highlighted_nodes=[],
        highlighted_edges=[],
    )

    # Store in conversation
    if conversation_id not in _conversations_db:
        _conversations_db[conversation_id] = {
            "conversation_id": conversation_id,
            "project_id": str(request.project_id),
            "messages": [],
            "created_at": datetime.now(),
            "updated_at": datetime.now(),
        }

    _conversations_db[conversation_id]["messages"].extend(
        [user_message.model_dump(), assistant_message.model_dump()]
    )
    _conversations_db[conversation_id]["updated_at"] = datetime.now()

    return ChatResponse(
        conversation_id=conversation_id,
        message=assistant_message,
        agent_trace={
            "intent": "search",
            "concepts_extracted": [],
            "tasks_planned": [],
            "queries_executed": [],
            "reasoning_steps": [],
        },
    )


@router.get("/history/{project_id}", response_model=List[ConversationHistory])
async def get_chat_history(project_id: UUID):
    """Get all conversations for a project."""
    conversations = [
        ConversationHistory(**conv)
        for conv in _conversations_db.values()
        if conv["project_id"] == str(project_id)
    ]
    return conversations


@router.get("/conversation/{conversation_id}", response_model=ConversationHistory)
async def get_conversation(conversation_id: str):
    """Get a specific conversation."""
    conv = _conversations_db.get(conversation_id)
    if not conv:
        raise HTTPException(status_code=404, detail="Conversation not found")
    return ConversationHistory(**conv)


@router.delete("/conversation/{conversation_id}")
async def delete_conversation(conversation_id: str):
    """Delete a conversation."""
    if conversation_id not in _conversations_db:
        raise HTTPException(status_code=404, detail="Conversation not found")
    del _conversations_db[conversation_id]
    return {"status": "deleted", "conversation_id": conversation_id}


@router.post("/explain/{node_id}")
async def explain_node(node_id: str, project_id: UUID):
    """
    Generate AI explanation for a node when clicked in Exploration Mode.

    This is called when user clicks a node in the graph visualization.
    """
    # TODO: Implement node explanation using LLM
    return {
        "node_id": node_id,
        "explanation": f"[Placeholder] AI explanation for node {node_id}",
        "related_nodes": [],
        "suggested_questions": [
            "What methods does this paper use?",
            "What are the key findings?",
            "How does this relate to other papers?",
        ],
    }
