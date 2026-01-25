"""
Circuit Breaker Pattern for LLM Providers
Prevents cascading failures when LLM services are unavailable
"""
import asyncio
import time
from enum import Enum
from typing import Callable, TypeVar, Any
from dataclasses import dataclass, field
import logging

logger = logging.getLogger(__name__)

T = TypeVar('T')


class CircuitState(Enum):
    """Circuit breaker states"""
    CLOSED = "closed"      # Normal operation
    OPEN = "open"          # Blocking calls (failure threshold reached)
    HALF_OPEN = "half_open"  # Testing if service recovered


class CircuitBreakerOpenError(Exception):
    """Raised when circuit is open and call is blocked"""
    pass


@dataclass
class CircuitBreakerConfig:
    """Configuration for circuit breaker"""
    failure_threshold: int = 5          # Failures before opening
    recovery_timeout: float = 30.0      # Seconds before trying again
    half_open_max_calls: int = 3        # Test calls in half-open state
    success_threshold: int = 2          # Successes to close from half-open


@dataclass
class CircuitBreakerState:
    """Internal state tracking"""
    state: CircuitState = CircuitState.CLOSED
    failure_count: int = 0
    success_count: int = 0
    last_failure_time: float = 0
    half_open_calls: int = 0


class CircuitBreaker:
    """
    Circuit breaker for protecting LLM calls.

    Usage:
        breaker = CircuitBreaker(name="claude")

        async def call_llm():
            return await breaker.call(llm_provider.generate, prompt)
    """

    def __init__(
        self,
        name: str,
        config: CircuitBreakerConfig = None
    ):
        self.name = name
        self.config = config or CircuitBreakerConfig()
        self._state = CircuitBreakerState()
        self._lock = asyncio.Lock()

    @property
    def state(self) -> CircuitState:
        return self._state.state

    @property
    def is_closed(self) -> bool:
        return self._state.state == CircuitState.CLOSED

    @property
    def is_open(self) -> bool:
        return self._state.state == CircuitState.OPEN

    async def call(
        self,
        func: Callable[..., Any],
        *args,
        **kwargs
    ) -> T:
        """
        Execute function with circuit breaker protection.

        Args:
            func: Async function to call
            *args, **kwargs: Arguments to pass to function

        Returns:
            Result from function

        Raises:
            CircuitBreakerOpenError: If circuit is open
            Exception: If function raises and circuit stays closed
        """
        async with self._lock:
            await self._check_state()

        if self._state.state == CircuitState.OPEN:
            logger.warning(f"Circuit breaker '{self.name}' is OPEN, blocking call")
            raise CircuitBreakerOpenError(
                f"Circuit breaker '{self.name}' is open. "
                f"Service may be unavailable."
            )

        try:
            result = await func(*args, **kwargs)
            await self._on_success()
            return result
        except Exception as e:
            await self._on_failure(e)
            raise

    async def _check_state(self):
        """Check if state should transition"""
        if self._state.state == CircuitState.OPEN:
            time_since_failure = time.time() - self._state.last_failure_time
            if time_since_failure >= self.config.recovery_timeout:
                logger.info(f"Circuit breaker '{self.name}' transitioning to HALF_OPEN")
                self._state.state = CircuitState.HALF_OPEN
                self._state.half_open_calls = 0
                self._state.success_count = 0

    async def _on_success(self):
        """Handle successful call"""
        async with self._lock:
            self._state.failure_count = 0

            if self._state.state == CircuitState.HALF_OPEN:
                self._state.success_count += 1
                if self._state.success_count >= self.config.success_threshold:
                    logger.info(f"Circuit breaker '{self.name}' transitioning to CLOSED")
                    self._state.state = CircuitState.CLOSED

    async def _on_failure(self, error: Exception):
        """Handle failed call"""
        async with self._lock:
            self._state.failure_count += 1
            self._state.last_failure_time = time.time()

            logger.warning(
                f"Circuit breaker '{self.name}' failure {self._state.failure_count}/"
                f"{self.config.failure_threshold}: {error}"
            )

            if self._state.state == CircuitState.HALF_OPEN:
                logger.warning(f"Circuit breaker '{self.name}' transitioning to OPEN (failed in half-open)")
                self._state.state = CircuitState.OPEN
            elif self._state.failure_count >= self.config.failure_threshold:
                logger.warning(f"Circuit breaker '{self.name}' transitioning to OPEN")
                self._state.state = CircuitState.OPEN

    def reset(self):
        """Reset circuit breaker (for testing)"""
        self._state = CircuitBreakerState()


# Global circuit breakers for each LLM provider
_circuit_breakers: dict[str, CircuitBreaker] = {}


def get_circuit_breaker(provider_name: str) -> CircuitBreaker:
    """Get or create circuit breaker for a provider"""
    if provider_name not in _circuit_breakers:
        _circuit_breakers[provider_name] = CircuitBreaker(
            name=provider_name,
            config=CircuitBreakerConfig(
                failure_threshold=5,
                recovery_timeout=30.0,
                success_threshold=2
            )
        )
    return _circuit_breakers[provider_name]


def reset_all_circuit_breakers():
    """Reset all circuit breakers (for testing)"""
    for breaker in _circuit_breakers.values():
        breaker.reset()
