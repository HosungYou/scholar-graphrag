"""
LLM-based Entity Extractor

Extracts academic entities (Concepts, Methods, Findings) from paper text
using Claude, GPT-4, or other LLM providers.
"""

import json
import logging
from typing import Optional
from dataclasses import dataclass
from enum import Enum

logger = logging.getLogger(__name__)


class EntityType(str, Enum):
    PAPER = "Paper"
    AUTHOR = "Author"
    CONCEPT = "Concept"
    METHOD = "Method"
    FINDING = "Finding"
    DATASET = "Dataset"
    INSTITUTION = "Institution"
    RESULT = "Result"
    CLAIM = "Claim"


@dataclass
class ExtractedEntity:
    """Entity extracted from text."""

    entity_type: EntityType
    name: str
    description: str = ""
    confidence: float = 0.0
    properties: dict = None
    extraction_section: str = ""
    evidence_spans: list = None

    def __post_init__(self):
        if self.properties is None:
            self.properties = {}
        if self.evidence_spans is None:
            self.evidence_spans = []


EXTRACTION_PROMPT = """You are an expert academic research analyst. Extract structured entities from the following paper information.

Paper Title: {title}
Abstract: {abstract}

Extract the following entity types:

1. **Concepts** (key theoretical concepts, topics, or themes discussed)
2. **Methods** (research methodologies, techniques, or approaches used)
3. **Findings** (key results, conclusions, or discoveries)

Return your response as a JSON object with this structure:
{{
    "concepts": [
        {{"name": "concept name", "description": "brief description", "confidence": 0.9}}
    ],
    "methods": [
        {{"name": "method name", "description": "brief description", "confidence": 0.9}}
    ],
    "findings": [
        {{"name": "finding summary", "description": "detailed finding", "confidence": 0.9}}
    ]
}}

Rules:
- Extract only entities actually mentioned in the text
- Keep names concise (1-5 words)
- Confidence should be between 0.5 and 1.0
- Return empty arrays if no entities of that type are found
- Maximum 5 entities per type
- Focus on the most important and specific entities

Return only the JSON object, no additional text."""


SECTION_PROMPTS = {
    "methodology": """You are an expert academic research analyst. Extract structured entities from the METHODOLOGY section of a paper.

Paper Title: {title}
Methodology Section Text: {text}

Extract the following entity types:
1. **Methods** (research methodologies, techniques, algorithms, or approaches used) - up to 5
2. **Datasets** (datasets, corpora, or data sources used) - up to 3
3. **Concepts** (key concepts mentioned in the methodology) - up to 3

Return your response as a JSON object:
{{
    "methods": [{{"name": "...", "description": "...", "confidence": 0.9}}],
    "datasets": [{{"name": "...", "description": "...", "confidence": 0.9}}],
    "concepts": [{{"name": "...", "description": "...", "confidence": 0.9}}]
}}

Rules:
- Extract only entities actually mentioned in the text
- Keep names concise (1-5 words)
- Confidence between 0.5 and 1.0
- Return empty arrays if none found
- Return only the JSON object""",

    "results": """You are an expert academic research analyst. Extract structured entities from the RESULTS section of a paper.

Paper Title: {title}
Results Section Text: {text}

Extract the following entity types:
1. **Results** (key experimental results, statistical findings, performance metrics) - up to 5
2. **Concepts** (key concepts related to the results) - up to 3

Return your response as a JSON object:
{{
    "results": [{{"name": "...", "description": "...", "confidence": 0.9, "evidence": "exact quote from text"}}],
    "concepts": [{{"name": "...", "description": "...", "confidence": 0.9}}]
}}

Rules:
- Results should include specific numbers/metrics when available
- Keep names concise (1-8 words)
- Evidence should be a short verbatim quote
- Return only the JSON object""",

    "discussion": """You are an expert academic research analyst. Extract structured entities from the DISCUSSION section of a paper.

Paper Title: {title}
Discussion Section Text: {text}

Extract the following entity types:
1. **Claims** (key claims, conclusions, or implications made by the authors) - up to 3
2. **Concepts** (theoretical concepts discussed) - up to 3

Return your response as a JSON object:
{{
    "claims": [{{"name": "...", "description": "...", "confidence": 0.9, "evidence": "exact quote"}}],
    "concepts": [{{"name": "...", "description": "...", "confidence": 0.9}}]
}}

Rules:
- Claims should be specific assertions, not general observations
- Include evidence quotes when possible
- Return only the JSON object""",

    "introduction": """You are an expert academic research analyst. Extract structured entities from the INTRODUCTION section of a paper.

Paper Title: {title}
Introduction Section Text: {text}

Extract the following entity types:
1. **Concepts** (key theoretical concepts, topics, research problems) - up to 5
2. **Methods** (mentioned methodologies or approaches) - up to 2

Return your response as a JSON object:
{{
    "concepts": [{{"name": "...", "description": "...", "confidence": 0.9}}],
    "methods": [{{"name": "...", "description": "...", "confidence": 0.9}}]
}}

Rules:
- Focus on the most important and specific concepts
- Return only the JSON object"""
}


class EntityExtractor:
    """
    Extracts entities from academic papers using LLM.
    """

    def __init__(self, llm_provider=None):
        self.llm = llm_provider

    async def extract_from_paper(
        self,
        title: str,
        abstract: str,
        use_accurate_model: bool = False,
    ) -> dict:
        """
        Extract entities from a paper's title and abstract.

        Args:
            title: Paper title
            abstract: Paper abstract
            use_accurate_model: Use more accurate (slower/expensive) model

        Returns:
            Dictionary with 'concepts', 'methods', 'findings' lists
        """
        if not self.llm:
            return self._fallback_extraction(title, abstract)

        prompt = EXTRACTION_PROMPT.format(
            title=title,
            abstract=abstract[:3000],  # Limit abstract length
        )

        try:
            response = await self.llm.generate(
                prompt,
                max_tokens=1000,
                temperature=0.1,
                use_accurate=use_accurate_model,
            )

            # Parse JSON response
            result = self._parse_llm_response(response)
            return result

        except Exception as e:
            logger.warning(f"LLM extraction failed: {e}, using fallback")
            return self._fallback_extraction(title, abstract)

    def _parse_llm_response(self, response: str) -> dict:
        """Parse LLM response into structured entities."""
        try:
            # Try to extract JSON from response
            # Handle cases where LLM adds extra text
            json_start = response.find("{")
            json_end = response.rfind("}") + 1

            if json_start >= 0 and json_end > json_start:
                json_str = response[json_start:json_end]
                data = json.loads(json_str)

                return {
                    "concepts": [
                        ExtractedEntity(
                            entity_type=EntityType.CONCEPT,
                            name=c.get("name", ""),
                            description=c.get("description", ""),
                            confidence=c.get("confidence", 0.7),
                        )
                        for c in data.get("concepts", [])
                        if c.get("name")
                    ],
                    "methods": [
                        ExtractedEntity(
                            entity_type=EntityType.METHOD,
                            name=m.get("name", ""),
                            description=m.get("description", ""),
                            confidence=m.get("confidence", 0.7),
                        )
                        for m in data.get("methods", [])
                        if m.get("name")
                    ],
                    "findings": [
                        ExtractedEntity(
                            entity_type=EntityType.FINDING,
                            name=f.get("name", ""),
                            description=f.get("description", ""),
                            confidence=f.get("confidence", 0.7),
                        )
                        for f in data.get("findings", [])
                        if f.get("name")
                    ],
                }

        except json.JSONDecodeError as e:
            logger.warning(f"Failed to parse LLM response as JSON: {e}")

        return {"concepts": [], "methods": [], "findings": []}

    def _parse_section_response(self, response: str, section: str) -> dict:
        """Parse section-specific JSON responses into ExtractedEntity objects."""
        try:
            # Extract JSON from response
            json_start = response.find("{")
            json_end = response.rfind("}") + 1

            if json_start >= 0 and json_end > json_start:
                json_str = response[json_start:json_end]
                data = json.loads(json_str)

                result = {}

                # Map response keys to entity types
                type_mapping = {
                    "results": EntityType.RESULT,
                    "claims": EntityType.CLAIM,
                    "methods": EntityType.METHOD,
                    "concepts": EntityType.CONCEPT,
                    "datasets": EntityType.DATASET,
                }

                for key, entity_type in type_mapping.items():
                    if key in data:
                        entities = []
                        for item in data[key]:
                            if not item.get("name"):
                                continue

                            entity = ExtractedEntity(
                                entity_type=entity_type,
                                name=item.get("name", ""),
                                description=item.get("description", ""),
                                confidence=item.get("confidence", 0.7),
                            )

                            # Add evidence spans if available
                            if "evidence" in item and item["evidence"]:
                                entity.evidence_spans = [item["evidence"]]

                            entities.append(entity)

                        result[key] = entities

                return result

        except json.JSONDecodeError as e:
            logger.warning(f"Failed to parse section response as JSON: {e}")
        except Exception as e:
            logger.warning(f"Error parsing section response: {e}")

        return {}

    def _fallback_extraction(self, title: str, abstract: str) -> dict:
        """
        Simple keyword-based extraction as fallback.
        Used when LLM is not available or fails.
        """
        import re

        text = f"{title} {abstract}".lower()
        concepts = []
        methods = []
        findings = []

        # Common concept patterns
        concept_patterns = [
            (r"\b(artificial intelligence|ai)\b", "Artificial Intelligence"),
            (r"\b(machine learning|ml)\b", "Machine Learning"),
            (r"\b(deep learning)\b", "Deep Learning"),
            (r"\b(neural network)\b", "Neural Network"),
            (r"\b(natural language processing|nlp)\b", "Natural Language Processing"),
            (r"\b(large language model|llm)\b", "Large Language Model"),
            (r"\b(chatbot|chat bot)\b", "Chatbot"),
            (r"\b(generative ai|genai)\b", "Generative AI"),
            (r"\b(education|educational)\b", "Education"),
            (r"\b(learning outcome)\b", "Learning Outcome"),
            (r"\b(student engagement)\b", "Student Engagement"),
            (r"\b(personalized learning)\b", "Personalized Learning"),
        ]

        # Common method patterns
        method_patterns = [
            (r"\b(experimental study|experiment)\b", "Experimental Study"),
            (r"\b(quasi-experimental)\b", "Quasi-experimental Design"),
            (r"\b(randomized controlled trial|rct)\b", "Randomized Controlled Trial"),
            (r"\b(survey|questionnaire)\b", "Survey"),
            (r"\b(interview)\b", "Interview"),
            (r"\b(meta-analysis)\b", "Meta-analysis"),
            (r"\b(systematic review)\b", "Systematic Review"),
            (r"\b(case study)\b", "Case Study"),
            (r"\b(mixed method)\b", "Mixed Methods"),
            (r"\b(qualitative)\b", "Qualitative Research"),
            (r"\b(quantitative)\b", "Quantitative Research"),
        ]

        # Extract concepts
        for pattern, name in concept_patterns:
            if re.search(pattern, text):
                concepts.append(
                    ExtractedEntity(
                        entity_type=EntityType.CONCEPT,
                        name=name,
                        description="Extracted via keyword matching",
                        confidence=0.6,
                    )
                )

        # Extract methods
        for pattern, name in method_patterns:
            if re.search(pattern, text):
                methods.append(
                    ExtractedEntity(
                        entity_type=EntityType.METHOD,
                        name=name,
                        description="Extracted via keyword matching",
                        confidence=0.6,
                    )
                )

        # Simple finding extraction (look for result indicators)
        finding_indicators = [
            r"(significantly (improved|increased|decreased|reduced))",
            r"(positive (effect|impact|correlation))",
            r"(negative (effect|impact|correlation))",
            r"(no significant (difference|effect))",
            r"(results (show|indicate|suggest))",
        ]

        for pattern in finding_indicators:
            match = re.search(pattern, text)
            if match:
                findings.append(
                    ExtractedEntity(
                        entity_type=EntityType.FINDING,
                        name=match.group(0).capitalize(),
                        description="Extracted via pattern matching",
                        confidence=0.5,
                    )
                )
                break  # Only one finding from patterns

        return {
            "concepts": concepts[:5],
            "methods": methods[:3],
            "findings": findings[:3],
        }

    def _split_into_sections(self, full_text: str) -> dict[str, str]:
        """Split full text into sections using regex patterns."""
        import re
        sections = {}

        # Common section header patterns
        section_patterns = [
            (r'(?i)\b(?:introduction|1\.?\s+introduction)\b', 'introduction'),
            (r'(?i)\b(?:method(?:ology|s)?|2\.?\s+method(?:ology|s)?|research\s+design)\b', 'methodology'),
            (r'(?i)\b(?:results?|findings?|3\.?\s+results?)\b', 'results'),
            (r'(?i)\b(?:discussion|4\.?\s+discussion|implications?)\b', 'discussion'),
            (r'(?i)\b(?:conclusion|5\.?\s+conclusion)\b', 'discussion'),  # merge with discussion
        ]

        # Find section boundaries
        boundaries = []
        for pattern, section_name in section_patterns:
            for match in re.finditer(pattern, full_text):
                boundaries.append((match.start(), section_name))

        # Sort by position
        boundaries.sort(key=lambda x: x[0])

        # Extract text between boundaries
        for i, (start, name) in enumerate(boundaries):
            end = boundaries[i + 1][0] if i + 1 < len(boundaries) else len(full_text)
            text = full_text[start:end].strip()
            if len(text) > 100:  # Only include substantial sections
                if name in sections:
                    sections[name] += "\n" + text  # Merge duplicate section names
                else:
                    sections[name] = text

        return sections

    async def extract_from_sections(self, title: str, sections: dict[str, str]) -> dict:
        """Extract entities from paper sections with section-specific prompts."""
        all_entities = {"concepts": [], "methods": [], "findings": [], "results": [], "claims": [], "datasets": []}

        for section_name, text in sections.items():
            if section_name not in SECTION_PROMPTS:
                continue

            prompt = SECTION_PROMPTS[section_name].format(title=title, text=text[:3000])

            try:
                response = await self.llm.generate(prompt, max_tokens=1000, temperature=0.1)
                parsed = self._parse_section_response(response, section_name)

                # Add section attribution to each entity
                for entity_list in parsed.values():
                    for entity in entity_list:
                        entity.extraction_section = section_name

                # Merge into all_entities
                for key, entities in parsed.items():
                    if key in all_entities:
                        all_entities[key].extend(entities)
            except Exception as e:
                logger.warning(f"Section extraction failed for {section_name}: {e}")

        return all_entities

    async def extract_from_full_text(self, title: str, full_text: str) -> dict:
        """Extract entities from full paper text by splitting into sections first."""
        if not self.llm:
            return self._fallback_extraction(title, full_text[:3000])

        sections = self._split_into_sections(full_text)

        if not sections:
            # Fallback to abstract-based extraction if section detection fails
            return await self.extract_from_paper(title=title, abstract=full_text[:3000])

        return await self.extract_from_sections(title, sections)

    async def batch_extract(
        self,
        papers: list[dict],
        batch_size: int = 10,
        progress_callback=None,
    ) -> list[dict]:
        """
        Extract entities from multiple papers in batches.

        Args:
            papers: List of dicts with 'title' and 'abstract'
            batch_size: Number of papers to process before yielding
            progress_callback: Optional callback for progress updates

        Returns:
            List of extraction results
        """
        results = []

        for i, paper in enumerate(papers):
            result = await self.extract_from_paper(
                title=paper.get("title", ""),
                abstract=paper.get("abstract", ""),
            )
            results.append(result)

            if progress_callback and (i + 1) % batch_size == 0:
                progress_callback(i + 1, len(papers))

        return results
