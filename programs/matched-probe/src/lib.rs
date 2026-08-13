//! Project-owned program used only by SovereignKit controlled experiments.
//!
//! Both accepted transaction classes execute the same program shape. The
//! discriminator selects one of two equal-length markers; all validation and
//! logging after that selection is shared.

// The Agave 4.0.0 entrypoint macro still emits legacy `target_os = "solana"`
// and custom allocator/panic cfgs that Rust 1.97's check-cfg cannot discover.
#![allow(unexpected_cfgs)]

use solana_account_info::AccountInfo;
use solana_msg::sol_log;
use solana_program_entrypoint::{entrypoint, ProgramResult};
use solana_program_error::ProgramError;
use solana_pubkey::Pubkey;

pub const MATCHED_CONTROL_DISCRIMINATOR: u8 = 0;
pub const PROGRAM_X_DISCRIMINATOR: u8 = 1;
pub const NONCE_LEN: usize = 16;
pub const INSTRUCTION_DATA_LEN: usize = 1 + NONCE_LEN;

const MATCHED_CONTROL_MARKER: &str = "SOVEREIGNKIT:00";
const PROGRAM_X_MARKER: &str = "SOVEREIGNKIT:01";

entrypoint!(process_instruction);

pub fn process_instruction(
    _program_id: &Pubkey,
    accounts: &[AccountInfo],
    instruction_data: &[u8],
) -> ProgramResult {
    if !accounts.is_empty() {
        return Err(ProgramError::InvalidArgument);
    }

    let marker = validate_and_select_marker(instruction_data)?;

    // One equal-length observable operation prevents the class selection from
    // being optimized away while keeping the post-selection path identical.
    sol_log(marker);
    Ok(())
}

fn validate_and_select_marker(instruction_data: &[u8]) -> Result<&'static str, ProgramError> {
    if instruction_data.len() != INSTRUCTION_DATA_LEN {
        return Err(ProgramError::InvalidInstructionData);
    }

    let discriminator = instruction_data[0];
    if discriminator > PROGRAM_X_DISCRIMINATOR {
        return Err(ProgramError::InvalidInstructionData);
    }

    Ok([MATCHED_CONTROL_MARKER, PROGRAM_X_MARKER][usize::from(discriminator)])
}

#[cfg(test)]
mod tests {
    use super::*;

    fn payload(discriminator: u8) -> [u8; INSTRUCTION_DATA_LEN] {
        let mut value = [b'a'; INSTRUCTION_DATA_LEN];
        value[0] = discriminator;
        value
    }

    #[test]
    fn accepts_both_matched_classes_with_equal_marker_width() {
        let control = validate_and_select_marker(&payload(MATCHED_CONTROL_DISCRIMINATOR)).unwrap();
        let program_x = validate_and_select_marker(&payload(PROGRAM_X_DISCRIMINATOR)).unwrap();

        assert_eq!(control.len(), program_x.len());
        assert_ne!(control, program_x);
    }

    #[test]
    fn rejects_unknown_discriminator() {
        assert_eq!(
            validate_and_select_marker(&payload(2)),
            Err(ProgramError::InvalidInstructionData)
        );
    }

    #[test]
    fn rejects_non_fixed_width_payloads() {
        assert_eq!(
            validate_and_select_marker(&[]),
            Err(ProgramError::InvalidInstructionData)
        );
        assert_eq!(
            validate_and_select_marker(&[MATCHED_CONTROL_DISCRIMINATOR; 18]),
            Err(ProgramError::InvalidInstructionData)
        );
    }
}
