use regex::Regex;

fn main() {
    let zip = Regex::new(r"^\d{5}(-\d{4})?$").unwrap();
}
