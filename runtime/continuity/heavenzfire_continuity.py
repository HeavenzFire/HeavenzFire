#!/usr/bin/env python3
"""HeavenzFire local continuity supervisor. Python stdlib only; loopback Ollama only."""
import argparse, json, os, signal, sqlite3, time, urllib.request, uuid
from datetime import datetime, timezone
from pathlib import Path

DATA = Path(os.environ.get("HEAVENZFIRE_DATA", str(Path.home() / "AppData" / "Local" / "HeavenzFire" / "Continuity")))
DB = DATA / "continuity.sqlite3"
OLLAMA = os.environ.get("HEAVENZFIRE_OLLAMA_URL", "http://127.0.0.1:11434")
MODEL = os.environ.get("HEAVENZFIRE_MODEL", "heavenzfire-runtime:latest")

def utc():
    return datetime.now(timezone.utc).isoformat(timespec="seconds")

def connect():
    DATA.mkdir(parents=True, exist_ok=True)
    c = sqlite3.connect(str(DB), timeout=10)
    c.row_factory = sqlite3.Row
    c.execute("PRAGMA journal_mode=WAL")
    c.execute("PRAGMA synchronous=FULL")
    c.execute("CREATE TABLE IF NOT EXISTS events(id INTEGER PRIMARY KEY,ts TEXT NOT NULL,kind TEXT NOT NULL,agent TEXT NOT NULL,content TEXT NOT NULL,task_id TEXT)")
    c.execute("CREATE TABLE IF NOT EXISTS tasks(id TEXT PRIMARY KEY,created_at TEXT NOT NULL,status TEXT NOT NULL,prompt TEXT NOT NULL,result TEXT,attempts INTEGER NOT NULL DEFAULT 0,updated_at TEXT NOT NULL)")
    c.execute("CREATE TABLE IF NOT EXISTS memories(id INTEGER PRIMARY KEY,ts TEXT NOT NULL,topic TEXT NOT NULL,lesson TEXT NOT NULL,source_task TEXT)")
    c.commit()
    return c

def event(c, kind, agent, content, task_id=None):
    c.execute("INSERT INTO events(ts,kind,agent,content,task_id) VALUES(?,?,?,?,?)", (utc(),kind,agent,content[:20000],task_id))
    c.commit()

def enqueue(c, prompt):
    tid = str(uuid.uuid4())
    c.execute("INSERT INTO tasks(id,created_at,status,prompt,updated_at) VALUES(?,?,?,?,?)",(tid,utc(),"queued",prompt,utc()))
    c.commit()
    return tid

def ollama(prompt, system, timeout=90):
    payload = json.dumps({"model":MODEL,"stream":False,"messages":[{"role":"system","content":system},{"role":"user","content":prompt}],"options":{"temperature":0.3,"num_ctx":2048,"num_predict":400}}).encode("utf-8")
    req = urllib.request.Request(OLLAMA.rstrip("/")+"/api/chat",data=payload,headers={"Content-Type":"application/json"},method="POST")
    with urllib.request.urlopen(req,timeout=timeout) as res:
        obj = json.loads(res.read().decode("utf-8"))
    return obj.get("message",{}).get("content","").strip()

def ollama_ready():
    try:
        with urllib.request.urlopen(OLLAMA.rstrip("/")+"/api/tags",timeout=3) as res:
            obj=json.loads(res.read().decode("utf-8"))
        names=[m.get("name","") for m in obj.get("models",[])]
        return MODEL in names or MODEL.split(":")[0] in names, names
    except Exception as e:
        return False,[str(e)]

def recent_memory(c, limit=6):
    rows=c.execute("SELECT topic,lesson FROM memories ORDER BY id DESC LIMIT ?",(limit,)).fetchall()
    return "\n".join("- "+r["topic"]+": "+r["lesson"] for r in rows) or "(no saved lessons yet)"

def run_cycle(c, task):
    tid,prompt=task["id"],task["prompt"]
    c.execute("UPDATE tasks SET status='running',attempts=attempts+1,updated_at=? WHERE id=?",(utc(),tid)); c.commit()
    event(c,"task_started","supervisor",prompt,tid)
    shared="Project: HeavenzFire local-first continuity. Work offline when possible. Do not claim tests passed unless executed. Never expose credentials. No external network calls except configured loopback Ollama. Prefer concrete, testable steps. Saved lessons:\n"+recent_memory(c)
    roles=[
      ("Planner","You are Planner. Propose a bounded plan, assumptions, and a test."),
      ("Guardian","You are Guardian. Challenge the plan for safety, data loss, false claims, and failure modes. Correct it."),
      ("Builder","You are Builder. Reconcile prior messages into an actionable result and verification steps. Do not execute shell commands.")
    ]
    prior=""; transcript=[]
    try:
        for name,role in roles:
            answer=ollama("Task:\n"+prompt+"\n\nPrior agent discussion:\n"+(prior or "(first speaker)")+"\nRespond concisely and evidence-consciously.",shared+"\n"+role)
            transcript.append((name,answer)); event(c,"agent_message",name,answer,tid)
            prior += "\n["+name+"]\n"+answer+"\n"
        result="\n\n".join("## "+n+"\n"+a for n,a in transcript)
        c.execute("UPDATE tasks SET status='completed',result=?,updated_at=? WHERE id=?",(result,utc(),tid))
        c.execute("INSERT INTO memories(ts,topic,lesson,source_task) VALUES(?,?,?,?)",(utc(),prompt[:160],transcript[-1][1][:3000],tid)); c.commit()
        event(c,"task_completed","supervisor","Three-agent discussion completed. Saved reusable retrieval memory; this is not model-weight training.",tid)
        print("["+utc()+"] completed "+tid,flush=True); return True
    except Exception as e:
        c.execute("UPDATE tasks SET status='queued',updated_at=? WHERE id=?",(utc(),tid)); c.commit()
        event(c,"local_model_unavailable","supervisor",str(e),tid)
        print("["+utc()+"] model unavailable/error; task preserved in queue: "+str(e),flush=True); return False

def self_test():
    import tempfile
    global DATA,DB
    old_data,old_db=DATA,DB
    with tempfile.TemporaryDirectory(prefix="hf-continuity-test-") as td:
        DATA=Path(td); DB=DATA/"test.sqlite3"; c=connect()
        tid=enqueue(c,"synthetic self-test task")
        row=c.execute("SELECT status,prompt FROM tasks WHERE id=?",(tid,)).fetchone()
        assert row["status"]=="queued" and row["prompt"]=="synthetic self-test task"
        event(c,"test","self-test","SQLite event persistence",tid)
        assert c.execute("SELECT COUNT(*) FROM events").fetchone()[0]==1
        assert c.execute("PRAGMA integrity_check").fetchone()[0]=="ok"
        c.close()
    DATA,DB=old_data,old_db
    print("PASS: database creation, durable queue, event ledger, SQLite integrity")
    print("NOT TESTED: live Ollama inference, Windows startup, multi-machine mesh")
    return 0

def main():
    p=argparse.ArgumentParser(description="HeavenzFire local agent continuity supervisor")
    p.add_argument("--self-test",action="store_true")
    p.add_argument("--once",action="store_true")
    p.add_argument("--enqueue",metavar="TASK")
    p.add_argument("--interval",type=int,default=20)
    p.add_argument("--status",action="store_true")
    args=p.parse_args()
    if args.self_test: return self_test()
    c=connect()
    if args.enqueue:
        tid=enqueue(c,args.enqueue); print("queued task "+tid+"\nDatabase: "+str(DB)); c.close(); return 0
    if args.status:
        counts={r["status"]:r["n"] for r in c.execute("SELECT status,COUNT(*) n FROM tasks GROUP BY status")}
        ready,models=ollama_ready()
        print(json.dumps({"db":str(DB),"ollama_url":OLLAMA,"model":MODEL,"ollama_ready":ready,"models_or_error":models,"tasks":counts,"recent_events":[dict(r) for r in c.execute("SELECT ts,kind,agent,content FROM events ORDER BY id DESC LIMIT 8")]},indent=2))
        c.close(); return 0
    if not c.execute("SELECT 1 FROM tasks LIMIT 1").fetchone():
        enqueue(c,"Review HeavenzFire local continuity. Identify one concrete reliability improvement and define a safe test.")
    stopping=[False]
    def stop_handler(*_): stopping[0]=True
    for sig in (signal.SIGINT,signal.SIGTERM):
        try: signal.signal(sig,stop_handler)
        except Exception: pass
    print("HeavenzFire continuity supervisor starting. DB="+str(DB)+" MODEL="+MODEL+" endpoint="+OLLAMA,flush=True)
    while not stopping[0]:
        row=c.execute("SELECT * FROM tasks WHERE status='queued' ORDER BY created_at LIMIT 1").fetchone()
        if row:
            ready,_=ollama_ready()
            if ready:
                succeeded=run_cycle(c,dict(row))
                if not succeeded and not args.once: time.sleep(max(5,args.interval))
            else:
                event(c,"waiting_local_model","supervisor","Local Ollama/model unavailable; task remains queued.",row["id"])
                print("["+utc()+"] waiting for local Ollama/model; queue is durable",flush=True)
                if args.once: break
                time.sleep(max(5,args.interval)); continue
            if args.once: break
        else: time.sleep(max(5,args.interval))
    c.close(); print("Supervisor stopped cleanly.",flush=True); return 0

if __name__=="__main__":
    raise SystemExit(main())
