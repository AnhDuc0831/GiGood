const fs = require('fs');

let f = 'app_mobile/app/(app)/(tabs)/board.tsx';
let c = fs.readFileSync(f, 'utf8');

c = c.replace(
  /const handleCheckout = useCallback\(\(\) => \{[\s\S]*?\}, \[acceptJob, checkingOut, exitSelection, has, jobs, profile, releaseEscrow, showToast\]\)/,
  `const handleCheckout = useCallback(async () => {
    if (!profile || checkingOut) return
    const selectedJobs = jobs.filter((job) => has(job.id))
    if (selectedJobs.length === 0) return

    let totalTokenFee = 0
    let jobsToAccept = 0

    for (const job of selectedJobs) {
      if (job.owner.id !== profile.id && job.status === 'Open') {
        jobsToAccept += 1
        totalTokenFee += Math.ceil(job.price / 10000)
      }
    }

    const executeCheckout = async () => {
      setCheckingOut(true)
      let accepted = 0
      let released = 0
      let skipped = 0
      const failures: string[] = []

      for (const job of selectedJobs) {
        try {
          if (job.owner.id === profile.id) {
            if (job.isCompletedReported) {
              await releaseEscrow(job.id)
              released += 1
            } else {
              skipped += 1
            }
          } else if (job.status === 'Open') {
            await acceptJob(job.id)
            accepted += 1
          } else {
            skipped += 1
          }
        } catch (error) {
          failures.push(getApiErrorMessage(error, \`Không xử lý được "\${job.title}".\`))
        }
      }

      setCheckingOut(false)
      exitSelection()

      if (failures.length > 0) {
        const done = accepted + released
        showToast(
          done > 0
            ? \`Đã xử lý \${done} việc, \${failures.length} việc lỗi: \${failures[0]}\`
            : failures[0],
          'error',
        )
        return
      }

      const parts = [\`Đã nhận \${accepted} việc\`]
      if (released > 0) parts.push(\`giải ngân \${released} việc\`)
      if (skipped > 0) parts.push(\`bỏ qua \${skipped} việc\`)
      showToast(\`\${parts.join(', ')}.\`, 'success')
    }

    if (jobsToAccept > 0) {
      Alert.alert(
        'Xác nhận nhận việc',
        \`Bạn đang chọn \${jobsToAccept} công việc mới.\\nTổng phí nhận việc là \${totalTokenFee} Token sẽ bị trừ khỏi ví của bạn.\`,
        [
          { text: 'Huỷ', style: 'cancel' },
          { text: 'Xác nhận', onPress: () => void executeCheckout() }
        ]
      )
    } else {
      void executeCheckout()
    }
  }, [profile, checkingOut, jobs, has, acceptJob, exitSelection, releaseEscrow, showToast])`
);

fs.writeFileSync(f, c);
console.log('done');
