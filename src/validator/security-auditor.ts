export interface SecurityAuditResult {
  passed: boolean
  violations: string[]
  warnings: string[]
}

const DANGEROUS_PATTERNS: Array<{ regex: RegExp; message: string; fatal: boolean }> = [
  {
    regex: /curl\s+[^|]+\|\s*(ba|z)?sh/i,
    message: 'Potentially dangerous remote script execution (curl | bash)',
    fatal: true
  },
  {
    regex: /rm\s+-rf\s+[\/~]/i,
    message: 'Destructive root or home directory deletion pattern',
    fatal: true
  },
  {
    regex: /powershell(\.exe)?\s+(-enc|-encodedcommand)/i,
    message: 'Obfuscated PowerShell encoded command execution',
    fatal: true
  },
  {
    regex: /nc\s+.*-e\s+\/bin\/(ba)?sh/i,
    message: 'Potential reverse shell payload detected',
    fatal: true
  },
  {
    regex: /(ignore\s+all\s+previous\s+instructions|system\s+override\s+prompt)/i,
    message: 'Prompt injection or prompt escape pattern',
    fatal: false
  }
]

export function auditSkillContent(content?: string): SecurityAuditResult {
  const violations: string[] = []
  const warnings: string[] = []

  if (!content) {
    return { passed: true, violations, warnings }
  }

  // Check file size (< 2MB)
  if (content.length > 2 * 1024 * 1024) {
    violations.push('Skill instruction size exceeds 2MB limit')
  }

  for (const rule of DANGEROUS_PATTERNS) {
    if (rule.regex.test(content)) {
      if (rule.fatal) {
        violations.push(rule.message)
      } else {
        warnings.push(rule.message)
      }
    }
  }

  return {
    passed: violations.length === 0,
    violations,
    warnings
  }
}
