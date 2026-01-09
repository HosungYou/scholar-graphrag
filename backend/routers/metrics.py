import time
from typing import Optional
from datetime import datetime

import psutil
from fastapi import APIRouter, Query

router = APIRouter()

_start_time = time.time()


def get_process_metrics() -> dict:
    process = psutil.Process()
    mem_info = process.memory_info()
    
    return {
        "pid": process.pid,
        "memory_rss_mb": round(mem_info.rss / 1024 / 1024, 2),
        "memory_vms_mb": round(mem_info.vms / 1024 / 1024, 2),
        "memory_percent": round(process.memory_percent(), 2),
        "cpu_percent": process.cpu_percent(interval=0.1),
        "threads": process.num_threads(),
        "open_files": len(process.open_files()),
        "connections": len(process.net_connections()),
    }


def get_system_metrics() -> dict:
    cpu_percent = psutil.cpu_percent(interval=0.1, percpu=True)
    memory = psutil.virtual_memory()
    disk = psutil.disk_usage("/")
    
    return {
        "cpu_percent_per_core": cpu_percent,
        "cpu_percent_avg": round(sum(cpu_percent) / len(cpu_percent), 2),
        "cpu_count": psutil.cpu_count(),
        "memory_total_gb": round(memory.total / 1024 / 1024 / 1024, 2),
        "memory_available_gb": round(memory.available / 1024 / 1024 / 1024, 2),
        "memory_used_gb": round(memory.used / 1024 / 1024 / 1024, 2),
        "memory_percent": memory.percent,
        "disk_total_gb": round(disk.total / 1024 / 1024 / 1024, 2),
        "disk_used_gb": round(disk.used / 1024 / 1024 / 1024, 2),
        "disk_percent": disk.percent,
    }


@router.get("")
async def get_metrics(
    include_system: bool = Query(default=True),
    include_process: bool = Query(default=True),
):
    uptime_seconds = time.time() - _start_time
    
    response = {
        "timestamp": datetime.utcnow().isoformat(),
        "uptime_seconds": round(uptime_seconds, 2),
        "uptime_human": f"{int(uptime_seconds // 3600)}h {int((uptime_seconds % 3600) // 60)}m {int(uptime_seconds % 60)}s",
    }
    
    if include_process:
        response["process"] = get_process_metrics()
    
    if include_system:
        response["system"] = get_system_metrics()
    
    return response


@router.get("/summary")
async def get_metrics_summary():
    process = psutil.Process()
    mem_info = process.memory_info()
    memory = psutil.virtual_memory()
    
    return {
        "process_memory_mb": round(mem_info.rss / 1024 / 1024, 2),
        "process_cpu_percent": process.cpu_percent(interval=0.1),
        "system_memory_percent": memory.percent,
        "system_cpu_percent": psutil.cpu_percent(interval=0.1),
        "uptime_seconds": round(time.time() - _start_time, 2),
    }


@router.get("/history")
async def get_metrics_history(
    duration_seconds: int = Query(default=60, ge=1, le=3600),
    interval_seconds: int = Query(default=1, ge=1, le=60),
):
    samples = []
    sample_count = min(duration_seconds // interval_seconds, 60)
    
    for _ in range(sample_count):
        process = psutil.Process()
        mem_info = process.memory_info()
        
        samples.append({
            "timestamp": datetime.utcnow().isoformat(),
            "memory_mb": round(mem_info.rss / 1024 / 1024, 2),
            "cpu_percent": process.cpu_percent(interval=interval_seconds),
        })
    
    return {
        "samples": samples,
        "sample_count": len(samples),
        "interval_seconds": interval_seconds,
    }
