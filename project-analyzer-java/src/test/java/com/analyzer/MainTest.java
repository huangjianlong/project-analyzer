package com.analyzer;

import org.junit.jupiter.api.Test;
import static org.assertj.core.api.Assertions.assertThat;

class MainTest {

    @Test
    void mainClassExists() {
        assertThat(Main.class).isNotNull();
    }
}
