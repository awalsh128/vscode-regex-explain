package main

import "regexp"

var zip = regexp.MustCompile("^\\d{5}(-\\d{4})?$")
