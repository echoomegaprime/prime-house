export interface Brief {
  reply: string;
  evidence: string[];
}

export const TRACKS = ["abi", "pe", "elf", "hammer", "forge", "ipc", "method"] as const;
export type Track = (typeof TRACKS)[number];

const LESSONS: Record<Track, Brief> = {
  abi: {
    reply:
      "Cross-architecture is the adapter, not a shared stack. Microsoft x64 passes integers in RCX, RDX, R8, R9 and the caller leaves 32 bytes of shadow. System V passes them in RDI, RSI, RDX, RCX, R8, R9, has no shadow, and a leaf may use the 128-byte red zone. Call the wrong convention and the first function smashes the frame.",
    evidence: [
      "Microsoft x64 callee-saved: RBX, RBP, RDI, RSI, RSP, R12–R15, XMM6–XMM15.",
      "System V callee-saved: RBX, RBP, R12–R15.",
      "Floats: XMM0–XMM3 on Windows, XMM0–XMM7 on System V.",
      "Return: RAX or XMM0. System V may also use RDX and XMM1.",
      "An integration thunk converts one convention to the other. It does not patch a running image.",
    ],
  },
  pe: {
    reply:
      "A Windows image starts at MZ. e_lfanew points at the PE signature. AddressOfEntryPoint is an RVA, not a file offset. The import directory names the DLLs the process will bind. Read that. Do not rewrite the entry of a binary you did not build.",
    evidence: [
      "DOS e_magic is MZ. PE signature is PE\\0\\0.",
      "OptionalHeader.Magic: PE32 or PE32+.",
      "Subsystem: WINDOWS_CUI or WINDOWS_GUI tells you the host, not a way in.",
      "Integration uses the import table and a service you install. It does not add a new import to someone else's file.",
    ],
  },
  elf: {
    reply:
      "A Linux image starts with 0x7F ELF. e_entry is the start, program headers carry PT_LOAD and PT_INTERP, and DT_NEEDED is the library list. On FORGE, a dependency or an interpreter path that leaves /home/forge is outside the jail. Link inside the jail.",
    evidence: [
      "EI_CLASS 2 is 64-bit. EI_DATA 1 is little-endian.",
      "PT_INTERP names the loader. DT_NEEDED names the shared objects.",
      "Integration ships a systemd user unit. It does not rewrite another ELF's entry.",
    ],
  },
  hammer: {
    reply:
      "HAMMER is Windows. Integrate with a user-mode service under the Service Control Manager, a virtual service account, and no debug privilege. You install it. Prime speaks the contract. Prime does not inject, debug, or replace a system process.",
    evidence: [
      "Account: NT SERVICE\\ virtual account. No SeDebugPrivilege. No SeTcbPrivilege.",
      "Config under ProgramData. Not a Run key. Not a Winlogon notification.",
      "Transport: named pipe with an ACL for that service SID, or localhost you opened.",
      "Do not touch csrss, lsass, winlogon, or the boot path.",
    ],
  },
  forge: {
    reply:
      "FORGE is Linux inside the jail. Integrate with a systemd --user unit, NoNewPrivileges, and a write path you name under /home/forge. No ptrace, no CAP_SYS_ADMIN, no walk outside the jail.",
    evidence: [
      "NoNewPrivileges=yes. ProtectSystem=strict. PrivateTmp=yes.",
      "ReadWritePaths only the agent state directory under /home/forge.",
      "AmbientCapabilities empty. No CAP_SYS_PTRACE.",
      "Transport: a mode 0600 unix socket, or stdio JSON. Socket activation is enough.",
    ],
  },
  ipc: {
    reply:
      "One contract, two hosts. Length-prefixed JSON, one schema version, one direction of trust. Windows uses a named pipe locked to the service SID. Linux uses a unix socket mode 0600. Do not read another process's memory to discover the API.",
    evidence: [
      "Frame: 4-byte little-endian length, then UTF-8 JSON. Reject a frame over 1 MiB.",
      "First field is schema. Mismatch is a hard stop, not a guess.",
      "Auth is a token you provisioned. A stale token is Disconnect, then Connect.",
    ],
  },
  method: {
    reply:
      "Reverse engineering here is a reading discipline. Name the container, find the entry and the imports, state one hypothesis, trace that one boundary on a machine you own, and write the contract you can prove. Stop when the next step is code running in a process you did not launch.",
    evidence: [
      "Container: PE, ELF, script, or package.",
      "Read entry, imports or DT_NEEDED, and strings that name files or protocols.",
      "Trace with Process Monitor or strace. One boundary.",
      "The output is a contract. It is not a loader, a hook, or a persistence key.",
    ],
  },
};

export function schoolIndex(): Brief {
  return {
    reply: "School is open. Seven tracks: abi, pe, elf, hammer, forge, ipc, method. Say lesson and a track. Say integrate hammer or integrate forge for the install contract. I do not take over an operating system.",
    evidence: TRACKS.map((track) => `${track} — ${LESSONS[track].reply.slice(0, 90)}`),
  };
}

export function schoolLesson(track: string): Brief | null {
  const key = track.toLowerCase() as Track;
  if (!TRACKS.includes(key)) return null;
  return LESSONS[key];
}

export function integratePlan(which: "hammer" | "forge" | "both"): Brief {
  if (which === "both") {
    return {
      reply: "Two contracts, one schema. HAMMER gets a user-mode service with no debug privilege. FORGE gets a systemd user unit with no new privileges, inside /home/forge. You install both. I speak JSON over the pipe or the socket. I do not enter either kernel.",
      evidence: [...LESSONS.hammer.evidence, ...LESSONS.forge.evidence, ...LESSONS.ipc.evidence],
    };
  }
  const lesson = which === "hammer" ? LESSONS.hammer : LESSONS.forge;
  return {
    reply: `${lesson.reply} You install it. Then I can speak to it.`,
    evidence: [...lesson.evidence, ...LESSONS.ipc.evidence.slice(0, 2)],
  };
}

export function takeoverRefusal(): Brief {
  return {
    reply: "No. I don't take over an operating system. No injection, no ptrace, no token theft, no boot persistence, no replacement of a system process. Say integrate hammer or integrate forge. You install the contract. I will speak to it.",
    evidence: [
      "Refused: DLL injection, thread hijack, ptrace, SeDebugPrivilege.",
      "Refused: Run keys, Winlogon, bootkits, kernel modules you did not build and sign.",
      "Allowed: a service or user unit you install, a versioned JSON contract, localhost or a locked pipe.",
    ],
  };
}
