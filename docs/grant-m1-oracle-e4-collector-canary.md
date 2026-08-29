# Grant Milestone 1 — Oracle E4 Collector canary

Status: `PROVISIONED_CANARY_NOT_ADMITTED`.

This is a bounded replacement canary for the rejected Oracle E2 micro Collector.
It does not replace the three-observer topology, establish observer independence,
start Milestone 2, or authorize the repository itself to create paid infrastructure.

## Frozen candidate

- provider and region: Oracle Cloud Infrastructure, `sa-saopaulo-1`;
- role: Collector only;
- shape: `VM.Standard.E4.Flex`, x86-64;
- resources: 1 OCPU, 4 GiB memory, 12.5% burstable baseline;
- operating system: Oracle Linux 9;
- boot volume target: 50 GiB;
- public ingestion: disabled during the host canary;
- health endpoint: loopback only.

The public Oracle Brazil price snapshot produces an estimated burstable
compute-only cost of BRL 34.876306625 for 730 hours. The default boot volume
adds a displayed BRL 10.45/month, for a calculated burstable total of BRL
45.326306625. Oracle's create-instance estimator displayed BRL 131.21/month
even after the review page and the created instance both confirmed a 12.5%
burstable baseline. Oracle's billing documentation states that burstable CPU is
charged at the selected baseline while memory is charged in full. The checked-in
record therefore preserves both values and never mislabels the full-rate Console
estimate as being within the BRL 60 ceiling.

The account displayed BRL 1,500 in trial credits at creation time and a BRL 60
monthly budget with an 80% alert was active. Credits and alerts reduce immediate
cash risk but do not change the underlying usage price or remove the obligation
to stop the resource when the canary no longer needs it.

## Provisioning gate

The operator completed the following provisioning gates:

1. Pay As You Go is active;
2. the exact shape is visible in São Paulo;
3. the Console full-rate estimate was reviewed, its burstable limitation was
   documented, and the official baseline calculation remained within BRL 60;
4. an Oracle budget alert is active;
5. the dedicated VCN/NSG remains available and SSH is restricted to the current
   operator `/32` CIDR;
6. the operator confirms the final Create action after seeing the estimate.

The checked-in record contains only sanitized resource facts. It omits provider
resource identifiers, public IPs, CPF, card data, credentials, and screenshots
containing personal data.

## Admission gate

Provisioning is not admission. The frozen-runtime host preflight, service
restart, and Collector durability/replay drill passed on the correctly
identified E4 host on 2026-08-29. The earlier full-VM recovery attribution was
retracted after discovering that the ignored SSH target still named E2. The
host must still pass:

1. a complete 24-hour canary soak;
2. a controlled full-VM recovery rerun after the soak;
3. final secret-free, sanitized evidence retention.

The true E4 soak started at `2026-08-29T17:17:37.739Z`. Its first fsynced sample was
healthy with `stored_count=1`; no pass or admission claim exists until the
complete real-host summary is retrieved and validated.

The Observer owns the delivery queue; the Collector does not. Its recovery gate
therefore tests its actual responsibility: durable append-only storage and
idempotent replay handling. Observer queue recovery remains a separate observer
host gate and is not credited to this canary.

If any gate fails, stop the host and record the failure. A paid label does not
make the host trustworthy, independent, or accepted.

## Reproduction

```powershell
node scripts/verify-grant-m1-oracle-e4-canary-plan.mjs
node --test scripts/tests/grant-m1-oracle-e4-canary-plan.test.mjs
node --test scripts/tests/grant-m1-collector-host-preflight.test.mjs
node --test scripts/tests/grant-m1-collector-canary-soak.test.mjs
```

The live preflight and soak scripts intentionally run only on the target Linux
host. The soak writes one fsynced sample per minute for at least 86,400 seconds;
the local tests exercise the evaluator without shortening that admission floor.
